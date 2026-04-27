(function () {
  'use strict';

  const CSV_URL = 'dados-exames.csv';
  const THEME_STORAGE_KEY = 'dashboard_tema';

  function aplicarTema(tema) {
    const body = document.body;
    if (!body) return;
    const valor = (tema === 'claro' || tema === 'escuro') ? tema : 'escuro';
    body.setAttribute('data-theme', valor);
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('data-theme', valor);
    }
  }

  function iniciarTema() {
    let temaSalvo;
    try {
      temaSalvo = localStorage.getItem(THEME_STORAGE_KEY);
    } catch (_) {
      temaSalvo = null;
    }
    if (temaSalvo !== 'claro' && temaSalvo !== 'escuro') {
      temaSalvo = document.body.getAttribute('data-theme') || 'escuro';
    }
    aplicarTema(temaSalvo);

    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
      const atual = document.body.getAttribute('data-theme') === 'claro' ? 'claro' : 'escuro';
      const proximo = atual === 'claro' ? 'escuro' : 'claro';
      aplicarTema(proximo);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, proximo);
      } catch (_) {
        // ignore
      }
    });
  }

  function parseCSV(text) {
    const linhas = text.trim().split('\n');
    if (linhas.length < 2) return [];
    const parseRow = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuotes = !inQuotes;
        } else if ((c === ',' && !inQuotes) || c === '\r') {
          result.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
      result.push(current.trim());
      return result;
    };
    const headers = parseRow(linhas[0]);
    const dados = [];
    for (let i = 1; i < linhas.length; i++) {
      const valores = parseRow(linhas[i]);
      const obj = {};
      headers.forEach((h, j) => {
        obj[h] = valores[j] ?? '';
      });
      dados.push(obj);
    }
    return dados;
  }

  function parseNum(str) {
    if (str == null || str === '') return NaN;
    const s = String(str).replace(',', '.').trim();
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
  }

  function estaForaReferencia(reg) {
    const valor = parseNum(reg.Valor);
    if (isNaN(valor)) return false;
    const min = parseNum(reg['Referência Mínima']);
    const max = parseNum(reg['Referência Máxima']);
    const temMin = !isNaN(min);
    const temMax = !isNaN(max);
    if (!temMin && !temMax) return false;
    if (temMin && valor < min) return true;
    if (temMax && valor > max) return true;
    return false;
  }

  function formatarRef(reg) {
    const min = reg['Referência Mínima'];
    const max = reg['Referência Máxima'];
    if (!min && !max) return '—';
    if (min && max) return `${min} - ${max}`;
    if (min) return `≥ ${min}`;
    return `≤ ${max}`;
  }

  function atualizarResumo(dados) {
    if (!dados.length) return;
    const categorias = new Set(dados.map(r => r.Categoria).filter(Boolean));
    const foraRef = dados.filter(estaForaReferencia).length;
    const datas = [...new Set(dados.map(r => r.Data).filter(Boolean))];
    const dataExib = datas.length ? datas[0] : '—';

    document.getElementById('total-exames').textContent = dados.length;
    document.getElementById('total-categorias').textContent = categorias.size;
    document.getElementById('fora-referencia').textContent = foraRef;
    document.getElementById('data-exame').textContent = dataExib;
  }

  let dadosRegistros = [];
  let categoriasSelecionadas = new Set();
  let sortCol = 'Data';
  let sortDir = 1;

  function parseDataBR(str) {
    if (!str) return 0;
    const parts = String(str).trim().split(/[/-]/);
    if (parts.length !== 3) return 0;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[2], 10);
    const date = new Date(y, m, d);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function valorOrdenacao(reg, col) {
    if (col === 'Data') return parseDataBR(reg.Data);
    if (col === 'Valor') return parseNum(reg.Valor);
    if (col === 'Referencia') return formatarRef(reg);
    if (col === 'Status') return estaForaReferencia(reg) ? 'Atenção' : 'OK';
    const s = (reg[col] ?? '').toString();
    return s.toLowerCase();
  }

  function compararRegistros(a, b) {
    const va = valorOrdenacao(a, sortCol);
    const vb = valorOrdenacao(b, sortCol);
    if (typeof va === 'number' && typeof vb === 'number') {
      if (isNaN(va) && isNaN(vb)) return 0;
      if (isNaN(va)) return 1;
      if (isNaN(vb)) return -1;
      return sortDir * (va - vb);
    }
    const sa = String(va);
    const sb = String(vb);
    return sortDir * sa.localeCompare(sb, 'pt-BR');
  }

  function atualizarIconesOrdenacao() {
    document.querySelectorAll('.tabela-dados .th-sortable').forEach(th => {
      const col = th.getAttribute('data-sort');
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      icon.textContent = col === sortCol ? (sortDir === 1 ? ' ▲' : ' ▼') : '';
      th.classList.toggle('sort-asc', col === sortCol && sortDir === 1);
      th.classList.toggle('sort-desc', col === sortCol && sortDir === -1);
    });
  }

  function montarFiltrosCategorias(dados) {
    const categorias = [...new Set(dados.map(r => r.Categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const container = document.getElementById('tabela-filtros-checkboxes');
    if (!container) return;
    container.innerHTML = '';
    categorias.forEach(cat => {
      categoriasSelecionadas.add(cat);
      const label = document.createElement('label');
      label.className = 'tabela-filtro-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.setAttribute('data-categoria', cat);
      input.addEventListener('change', () => {
        if (input.checked) categoriasSelecionadas.add(cat);
        else categoriasSelecionadas.delete(cat);
        preencherTabela();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + cat));
      container.appendChild(label);
    });
  }

  function preencherTabela() {
    const filtrados = dadosRegistros.filter(r => categoriasSelecionadas.has(r.Categoria || ''));
    const ordenados = [...filtrados].sort(compararRegistros);

    const tbody = document.getElementById('tabela-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    ordenados.forEach(reg => {
      const tr = document.createElement('tr');
      const fora = estaForaReferencia(reg);
      const statusClass = fora ? 'status-fora' : 'status-ok';
      const statusText = fora ? 'Atenção' : 'OK';
      tr.innerHTML =
        '<td>' + (reg.Data || '—') + '</td>' +
        '<td>' + (reg.Categoria || '—') + '</td>' +
        '<td>' + (reg.Exame || '—') + '</td>' +
        '<td>' + (reg.Valor ?? '—') + '</td>' +
        '<td>' + (reg.Unidade || '—') + '</td>' +
        '<td>' + formatarRef(reg) + '</td>' +
        '<td><span class="' + statusClass + '">' + statusText + '</span></td>';
      tbody.appendChild(tr);
    });

    atualizarIconesOrdenacao();
  }

  function iniciarOrdenacaoTabela() {
    document.querySelectorAll('.tabela-dados .th-sortable').forEach(th => {
      const col = th.getAttribute('data-sort');
      if (!col) return;
      function ordenar() {
        if (sortCol === col) sortDir = -sortDir;
        else { sortCol = col; sortDir = 1; }
        preencherTabela();
      }
      th.addEventListener('click', ordenar);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(); }
      });
    });
  }

  const corPrincipal = 'rgb(45, 106, 79)';
  const corSecundaria = 'rgb(44, 122, 123)';

  function dadosPorExame(dados) {
    const porExame = {};
    dados.forEach(r => {
      const v = parseNum(r.Valor);
      if (isNaN(v)) return;
      const min = parseNum(r['Referência Mínima']);
      const max = parseNum(r['Referência Máxima']);
      if (isNaN(min) && isNaN(max)) return;
      const nome = r.Exame || '';
      if (!porExame[nome]) porExame[nome] = [];
      porExame[nome].push({
        data: r.Data,
        valor: v,
        refMin: min,
        refMax: max
      });
    });
    Object.keys(porExame).forEach(nome => {
      porExame[nome].sort((a, b) => {
        const da = parseDataBR(a.data);
        const db = parseDataBR(b.data);
        return da - db;
      });
    });
    return porExame;
  }

  function formatarDataCurta(str) {
    if (!str) return '';
    const parts = String(str).trim().split(/[/-]/);
    if (parts.length !== 3) return str;
    return parts[0] + '/' + parts[1] + '/' + parts[2].slice(-2);
  }

  let chartEvolucaoInstance = null;

  function criarGraficoEvolucao(dados) {
    const porExame = dadosPorExame(dados);
    const exames = Object.keys(porExame);
    const select = document.getElementById('exame-evolucao');
    const canvas = document.getElementById('chart-evolucao');
    if (!select || !canvas) return;

    select.innerHTML = '';
    exames.forEach(nome => {
      const opt = document.createElement('option');
      opt.value = nome;
      opt.textContent = nome;
      select.appendChild(opt);
    });

    function renderizarEvolucao() {
      const nome = select.value;
      const pontos = porExame[nome];
      if (!pontos || !pontos.length) return;

      if (chartEvolucaoInstance) {
        chartEvolucaoInstance.destroy();
        chartEvolucaoInstance = null;
      }

      const labels = pontos.map(p => formatarDataCurta(p.data));
      const valores = pontos.map(p => p.valor);
      const refMin = pontos.map(p => (isNaN(p.refMin) ? null : p.refMin));
      const refMax = pontos.map(p => (isNaN(p.refMax) ? null : p.refMax));

      const datasets = [
        {
          label: 'Meu resultado',
          data: valores,
          borderColor: corPrincipal,
          backgroundColor: 'rgba(45, 106, 79, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ];
      if (refMin.some(v => v != null)) {
        datasets.push({
          label: 'Referência mínima',
          data: refMin,
          borderColor: '#c53030',
          borderDash: [5, 5],
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0
        });
      }
      if (refMax.some(v => v != null)) {
        datasets.push({
          label: 'Referência máxima',
          data: refMax,
          borderColor: '#c53030',
          borderDash: [5, 5],
          borderWidth: 2,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0
        });
      }

      chartEvolucaoInstance = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const v = ctx.raw;
                  return v != null ? ctx.dataset.label + ': ' + v : null;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxRotation: 45, font: { size: 10 } }
            },
            y: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { font: { size: 10 } },
              beginAtZero: false
            }
          }
        }
      });
    }

    if (exames.length) {
      renderizarEvolucao();
      select.addEventListener('change', renderizarEvolucao);
    }
  }

  let chartPorCategoriaInstance = null;

  const coresLinhas = [
    'rgb(45, 106, 79)',
    'rgb(44, 122, 123)',
    'rgb(129, 99, 59)',
    'rgb(116, 76, 129)',
    'rgb(197, 48, 48)',
    'rgb(38, 92, 66)',
    'rgb(26, 82, 118)',
    'rgb(133, 73, 43)'
  ];

  function criarGraficoPorCategoria(dados) {
    const categorias = [...new Set(dados.map(r => r.Categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const select = document.getElementById('categoria-grafico');
    const canvas = document.getElementById('chart-por-categoria');
    if (!select || !canvas) return;

    select.innerHTML = '';
    categorias.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    });

    function renderizarPorCategoria() {
      const cat = select.value;
      const daCategoria = dados.filter(r => r.Categoria === cat && !isNaN(parseNum(r.Valor)));
      const datas = [...new Set(daCategoria.map(r => r.Data))].sort((a, b) => parseDataBR(a) - parseDataBR(b));
      const exames = [...new Set(daCategoria.map(r => r.Exame))];

      if (chartPorCategoriaInstance) {
        chartPorCategoriaInstance.destroy();
        chartPorCategoriaInstance = null;
      }

      if (datas.length === 0 || exames.length === 0) return;

      const valorPorExameEData = new Map();
      daCategoria.forEach(r => {
        const key = r.Exame + '|' + r.Data;
        valorPorExameEData.set(key, parseNum(r.Valor));
      });

      const labels = datas.map(d => formatarDataCurta(d));
      const datasets = exames.map((exame, i) => {
        const cor = coresLinhas[i % coresLinhas.length];
        const data = datas.map(data => valorPorExameEData.get(exame + '|' + data) ?? null);
        return {
          label: exame,
          data: data,
          borderColor: cor,
          backgroundColor: cor.replace('rgb', 'rgba').replace(')', ', 0.15)'),
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5
        };
      });

      chartPorCategoriaInstance = new Chart(canvas, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
              callbacks: {
                label: function (ctx) {
                  const v = ctx.raw;
                  return v != null ? ctx.dataset.label + ': ' + v : null;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxRotation: 45, font: { size: 10 } }
            },
            y: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { font: { size: 10 } },
              beginAtZero: false
            }
          }
        }
      });
    }

    if (categorias.length) {
      renderizarPorCategoria();
      select.addEventListener('change', renderizarPorCategoria);
    }
  }

  function criarGraficos(dados) {
    criarGraficoEvolucao(dados);
    criarGraficoPorCategoria(dados);
  }

  function mostrarErro(msg) {
    const container = document.querySelector('.container');
    const div = document.createElement('div');
    div.className = 'erro';
    div.textContent = msg;
    container.insertBefore(div, container.firstChild);
  }

  function init() {
    iniciarTema();

    fetch(CSV_URL)
      .then(r => {
        if (!r.ok) throw new Error('Arquivo dados-exames.csv não encontrado. Execute o projeto em um servidor local.');
        return r.text();
      })
      .then(text => {
        const dados = parseCSV(text);
        if (!dados.length) {
          mostrarErro('Nenhum dado válido no CSV.');
          return;
        }
        dadosRegistros = dados;
        categoriasSelecionadas = new Set([...new Set(dados.map(r => r.Categoria).filter(Boolean))]);
        sortCol = 'Data';
        sortDir = 1;
        atualizarResumo(dados);
        montarFiltrosCategorias(dados);
        preencherTabela();
        iniciarOrdenacaoTabela();
        criarGraficos(dados);
      })
      .catch(err => mostrarErro(err.message));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
