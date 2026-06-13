import { auth, db } from "./firebase-config.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const TAXAS = {
  credito: 0.045,
  debito: 0.02,
  pixDinheiro: 0.045
};

let clientes = [];
let servicos = [];
let fornecedores = [];
let produtos = [];
let atendimentos = [];
let financeiro = [];
let movimentacoesEstoque = [];
let graficosRelatorios = {};
let ultimoRelatorioDados = null;

let sistemaIniciado = false;
let atendimentoEditandoId = null;
let financeiroEditandoId = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  if (!sistemaIniciado) {
    sistemaIniciado = true;
    await iniciarSistema();
  }
});

document.getElementById("btnSair").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

window.mostrarTela = async function(id) {
  document.querySelectorAll(".tela").forEach(tela => tela.classList.remove("ativa"));
  document.getElementById(id).classList.add("ativa");

  if (id === "agenda") await carregarAtendimentos();
  if (id === "financeiro") await carregarFinanceiro();
  if (id === "relatorios") atualizarRelatorios();
  if (id === "produtos") {
    await carregarProdutos();
    await carregarMovimentacoesEstoque();
  }
  if (id === "fornecedores") await carregarFornecedores();

  atualizarDashboard();
};

async function iniciarSistema() {
  conectarEventos();

  await carregarClientes();
  await carregarServicos();
  await carregarFornecedores();
  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarAtendimentos();
  await carregarFinanceiro();

  definirDataHoje();
  configurarDatasRelatorio();
  atualizarSimulacaoAgenda();
  atualizarDashboard();
  atualizarRelatorios();
}

function conectarEventos() {
  ligar("btnSalvarCliente", "click", salvarCliente);
  ligar("btnSalvarServico", "click", salvarServico);
  ligar("btnSalvarFornecedor", "click", salvarFornecedor);
  ligar("btnSalvarProduto", "click", salvarProduto);
  ligar("btnSalvarReposicaoEstoque", "click", salvarReposicaoEstoque);
  ligar("btnSalvarAtendimento", "click", salvarAtendimento);
  ligar("btnSalvarFinanceiro", "click", salvarFinanceiro);
  ligar("btnAplicarRelatorio", "click", atualizarRelatorios);
  ligar("btnImprimirRelatorio", "click", imprimirRelatorio);
  ligar("btnExportarRelatorioXLSX", "click", exportarRelatorioXLSX);
  ligar("btnExportarRelatorioCSV", "click", exportarRelatorioCSV);
  ligar("relatorioPeriodo", "change", periodoRelatorioAlterado);
  ligar("relatorioDataInicial", "change", atualizarRelatorios);
  ligar("relatorioDataFinal", "change", atualizarRelatorios);

  ligar("agendaPagamento", "change", atualizarSimulacaoAgenda);
  ligar("agendaDescontoManual", "input", atualizarSimulacaoAgenda);
  ligar("agendaStatus", "change", atualizarSimulacaoAgenda);
}

function ligar(id, evento, funcao) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evento, funcao);
}

function dataHoje() {
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function definirDataHoje() {
  const hoje = dataHoje();
  if (document.getElementById("agendaData")) document.getElementById("agendaData").value = hoje;
  if (document.getElementById("finData")) document.getElementById("finData").value = hoje;
  if (document.getElementById("reposicaoData")) document.getElementById("reposicaoData").value = hoje;
  if (document.getElementById("relatorioDataFinal")) document.getElementById("relatorioDataFinal").value = hoje;
}

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function numero(valor) {
  return Number(valor || 0);
}

function arredondar(valor) {
  return Math.round(numero(valor) * 100) / 100;
}

function escapar(valor) {
  if (valor === null || valor === undefined) return "";

  return String(valor)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setTexto(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

function setValor(id, valor) {
  const el = document.getElementById(id);
  if (el) el.value = valor;
}

function calcularPagamento(valorBase, formaPagamento, descontoManual) {
  valorBase = numero(valorBase);
  descontoManual = numero(descontoManual);

  let taxaPercentual = 0;
  let descontoAutomatico = 0;
  let taxaMaquininha = 0;
  let totalCliente = valorBase;
  let valorLiquido = valorBase;

  if (formaPagamento === "Cartão de Crédito") {
    taxaPercentual = TAXAS.credito;
    taxaMaquininha = valorBase * TAXAS.credito;
    descontoManual = 0;
    totalCliente = valorBase;
    valorLiquido = valorBase - taxaMaquininha;
  } else if (formaPagamento === "Cartão de Débito") {
    taxaPercentual = TAXAS.debito;
    taxaMaquininha = valorBase * TAXAS.debito;
    descontoManual = 0;
    totalCliente = valorBase;
    valorLiquido = valorBase - taxaMaquininha;
  } else if (formaPagamento === "PIX" || formaPagamento === "Dinheiro") {
    taxaPercentual = TAXAS.pixDinheiro;
    descontoAutomatico = valorBase * TAXAS.pixDinheiro;
    taxaMaquininha = 0;
    totalCliente = valorBase - descontoAutomatico - descontoManual;
    valorLiquido = totalCliente;
  } else {
    totalCliente = valorBase - descontoManual;
    valorLiquido = totalCliente;
  }

  if (totalCliente < 0) totalCliente = 0;
  if (valorLiquido < 0) valorLiquido = 0;

  return {
    valorBase: arredondar(valorBase),
    taxaPercentual,
    descontoAutomatico: arredondar(descontoAutomatico),
    descontoManual: arredondar(descontoManual),
    totalCliente: arredondar(totalCliente),
    taxaMaquininha: arredondar(taxaMaquininha),
    valorLiquido: arredondar(valorLiquido)
  };
}

function classeStatus(status) {
  const s = String(status || "").toLowerCase();

  if (s.includes("concluído") || s.includes("concluido") || s.includes("recebido") || s.includes("pago")) return "status-verde";
  if (s.includes("confirmado")) return "status-azul";
  if (s.includes("cancelado")) return "status-vermelho";
  if (s.includes("pendente") || s.includes("agendado")) return "status-amarelo";

  return "status-cinza";
}

function badgeStatus(status) {
  return `<span class="status-badge ${classeStatus(status)}">${escapar(status)}</span>`;
}

function badgeTipo(tipo) {
  const classe = tipo === "Entrada" ? "status-verde" : "status-vermelho";
  return `<span class="status-badge ${classe}">${escapar(tipo)}</span>`;
}

/* DASHBOARD */

function atualizarDashboard() {
  const hoje = dataHoje();

  let atendimentosHoje = 0;
  let faturamentoHoje = 0;
  let receber = 0;
  let pagar = 0;
  let lucroHoje = 0;

  atendimentos.forEach(a => {
    if (a.data === hoje) atendimentosHoje++;

    if (a.status === "Agendado" || a.status === "Confirmado") {
      receber += numero(a.totalCliente || a.valorBase);
    }
  });

  financeiro.forEach(f => {
    const valor = numero(f.valor);
    const liquido = numero(f.valorLiquido || f.valor);
    const lucroReal = numero(f.valorLucroReal ?? f.lucroReal ?? liquido);

    if (f.data === hoje && f.tipo === "Entrada" && f.status === "Recebido") {
      faturamentoHoje += valor;
      lucroHoje += lucroReal;
    }

    if (f.tipo === "Saída" && f.status !== "Pago") {
      pagar += valor;
    }

    if (f.tipo === "Saída" && f.data === hoje) {
      lucroHoje -= valor;
    }
  });

  setTexto("totalClientes", clientes.length);
  setTexto("totalServicos", servicos.length);
  setTexto("totalProdutos", produtos.length);
  setTexto("totalAtendimentosHoje", atendimentosHoje);
  setTexto("faturamentoHoje", dinheiro(faturamentoHoje));
  setTexto("totalReceber", dinheiro(receber));
  setTexto("totalPagar", dinheiro(pagar));
  setTexto("lucroHoje", dinheiro(lucroHoje));
}

/* RELATÓRIOS */

function dataParaISO(data) {
  const yyyy = data.getFullYear();
  const mm = String(data.getMonth() + 1).padStart(2, "0");
  const dd = String(data.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function primeiroDiaMes(data = new Date()) {
  return dataParaISO(new Date(data.getFullYear(), data.getMonth(), 1));
}

function ultimoDiaMes(data = new Date()) {
  return dataParaISO(new Date(data.getFullYear(), data.getMonth() + 1, 0));
}

function primeiroDiaSemana(data = new Date()) {
  const copia = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const dia = copia.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  copia.setDate(copia.getDate() + diff);
  return dataParaISO(copia);
}

function configurarDatasRelatorio() {
  const periodo = document.getElementById("relatorioPeriodo");
  const inicial = document.getElementById("relatorioDataInicial");
  const final = document.getElementById("relatorioDataFinal");

  if (!periodo || !inicial || !final) return;

  if (!periodo.value) periodo.value = "mes";

  const hoje = new Date();

  if (periodo.value === "hoje") {
    inicial.value = dataHoje();
    final.value = dataHoje();
  } else if (periodo.value === "semana") {
    inicial.value = primeiroDiaSemana(hoje);
    final.value = dataHoje();
  } else if (periodo.value === "mes") {
    inicial.value = primeiroDiaMes(hoje);
    final.value = ultimoDiaMes(hoje);
  } else {
    if (!inicial.value) inicial.value = primeiroDiaMes(hoje);
    if (!final.value) final.value = dataHoje();
  }
}

function periodoRelatorioAlterado() {
  configurarDatasRelatorio();
  atualizarRelatorios();
}

function obterIntervaloRelatorio() {
  configurarDatasRelatorio();

  const inicial = document.getElementById("relatorioDataInicial")?.value || dataHoje();
  const final = document.getElementById("relatorioDataFinal")?.value || dataHoje();

  return {
    inicial,
    final
  };
}

function dataNoIntervalo(data, inicial, final) {
  if (!data) return false;
  return data >= inicial && data <= final;
}

function somarPorChave(lista, chaveNome, chaveValor = "valor") {
  const mapa = new Map();

  lista.forEach(item => {
    const nome = item[chaveNome] || "Não informado";
    const atual = mapa.get(nome) || {
      nome,
      quantidade: 0,
      valor: 0
    };

    atual.quantidade += numero(item.quantidade || 1);
    atual.valor += numero(item[chaveValor] || 0);

    mapa.set(nome, atual);
  });

  return [...mapa.values()].sort((a, b) => {
    if (b.quantidade !== a.quantidade) return b.quantidade - a.quantidade;
    return b.valor - a.valor;
  });
}

function renderTabelaSimples(containerId, colunas, linhas, vazio = "Nenhum dado encontrado para o período.") {
  const div = document.getElementById(containerId);
  if (!div) return;

  if (!linhas.length) {
    div.innerHTML = `<p>${vazio}</p>`;
    return;
  }

  div.innerHTML = `
    <table class="tabela-relatorio">
      <thead>
        <tr>
          ${colunas.map(c => `<th>${escapar(c.titulo)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${linhas.map(linha => `
          <tr>
            ${colunas.map(c => `<td>${c.render ? c.render(linha) : escapar(linha[c.campo])}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function destruirGraficoRelatorio(id) {
  if (graficosRelatorios[id]) {
    graficosRelatorios[id].destroy();
    delete graficosRelatorios[id];
  }
}

function criarGraficoRelatorio(id, tipo, dados, opcoesExtras = {}) {
  const canvas = document.getElementById(id);

  if (!canvas) return;
  if (typeof Chart === "undefined") return;

  destruirGraficoRelatorio(id);

  graficosRelatorios[id] = new Chart(canvas, {
    type: tipo,
    data: dados,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || context.dataset.label || "";
              const valor = context.raw || 0;

              if (context.dataset.tipoValor === "quantidade") {
                return `${label}: ${valor}`;
              }

              return `${label}: ${dinheiro(valor)}`;
            }
          }
        }
      },
      ...opcoesExtras
    }
  });
}

function dadosPizzaComFallback(lista, campoValor = "valor") {
  const total = lista.reduce((s, item) => s + numero(item[campoValor]), 0);

  if (!lista.length || total <= 0) {
    return {
      labels: ["Sem dados"],
      valores: [1],
      cores: ["#e5e7eb"]
    };
  }

  const cores = [
    "#be185d",
    "#ec4899",
    "#f97316",
    "#22c55e",
    "#0ea5e9",
    "#8b5cf6",
    "#f59e0b",
    "#ef4444",
    "#14b8a6",
    "#64748b"
  ];

  return {
    labels: lista.map(item => item.nome),
    valores: lista.map(item => numero(item[campoValor])),
    cores: lista.map((_, index) => cores[index % cores.length])
  };
}

function atualizarGraficosRelatorios(dados) {
  if (typeof Chart === "undefined") return;

  criarGraficoRelatorio("graficoEntradasSaidas", "bar", {
    labels: ["Entradas", "Despesas Pagas", "Saldo de Caixa"],
    datasets: [
      {
        label: "Valor",
        data: [
          dados.valorLiquido,
          dados.despesasPagas,
          dados.saldoCaixa
        ],
        backgroundColor: [
          "#22c55e",
          "#ef4444",
          dados.saldoCaixa >= 0 ? "#0ea5e9" : "#f97316"
        ]
      }
    ]
  }, {
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return dinheiro(value);
          }
        }
      }
    }
  });

  const formas = dadosPizzaComFallback(dados.formasPagamento, "valor");

  criarGraficoRelatorio("graficoFormasPagamento", "doughnut", {
    labels: formas.labels,
    datasets: [
      {
        label: "Total",
        data: formas.valores,
        backgroundColor: formas.cores
      }
    ]
  });

  const servicos = dados.servicosMaisVendidos.length
    ? dados.servicosMaisVendidos
    : [{ nome: "Sem dados", quantidade: 0, valor: 0 }];

  criarGraficoRelatorio("graficoServicosVendidos", "bar", {
    labels: servicos.map(item => item.nome),
    datasets: [
      {
        label: "Quantidade",
        tipoValor: "quantidade",
        data: servicos.map(item => numero(item.quantidade)),
        backgroundColor: "#be185d"
      }
    ]
  }, {
    indexAxis: "y",
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          precision: 0
        }
      }
    }
  });

  criarGraficoRelatorio("graficoLucroCustos", "bar", {
    labels: [
      "Lucro Real",
      "Materiais Usados",
      "Taxas de Cartão",
      "Descontos",
      "Compras de Estoque"
    ],
    datasets: [
      {
        label: "Valor",
        data: [
          dados.lucroRealAtendimentos,
          dados.materiaisUsados,
          dados.taxasCartao,
          dados.descontos,
          dados.comprasEstoque
        ],
        backgroundColor: [
          "#22c55e",
          "#f97316",
          "#8b5cf6",
          "#ec4899",
          "#ef4444"
        ]
      }
    ]
  }, {
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return dinheiro(value);
          }
        }
      }
    }
  });
}

function formatarDataBR(dataISO) {
  if (!dataISO) return "";

  const partes = String(dataISO).split("-");

  if (partes.length !== 3) return dataISO;

  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

function valorCSV(valor) {
  if (valor === null || valor === undefined) return "";

  return String(valor)
    .replaceAll('"', '""')
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}

function linhaCSV(campos) {
  return campos.map(campo => `"${valorCSV(campo)}"`).join(";");
}

function dinheiroCSV(valor) {
  return Number(valor || 0).toFixed(2).replace(".", ",");
}

function baixarArquivoTexto(nomeArquivo, conteudo, tipo = "text/plain;charset=utf-8") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function imprimirRelatorio() {
  atualizarRelatorios();

  const originalTitle = document.title;

  if (ultimoRelatorioDados) {
    document.title = `Relatorio-Sistema-Nail-${ultimoRelatorioDados.inicial}-a-${ultimoRelatorioDados.final}`;
  }

  window.print();

  setTimeout(() => {
    document.title = originalTitle;
  }, 1000);
}

function exportarRelatorioCSV() {
  atualizarRelatorios();

  if (!ultimoRelatorioDados) {
    alert("Nenhum relatório disponível para exportar.");
    return;
  }

  const r = ultimoRelatorioDados;
  const linhas = [];

  linhas.push(linhaCSV(["Sistema Nail Design"]));
  linhas.push(linhaCSV([`Relatório de ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`]));
  linhas.push("");

  linhas.push(linhaCSV(["RESUMO FINANCEIRO"]));
  linhas.push(linhaCSV(["Indicador", "Valor"]));
  r.resumoFinanceiro.forEach(item => {
    linhas.push(linhaCSV([item.nome, dinheiroCSV(item.valor)]));
  });

  linhas.push("");
  linhas.push(linhaCSV(["SERVIÇOS MAIS VENDIDOS"]));
  linhas.push(linhaCSV(["Serviço", "Quantidade", "Total"]));
  r.servicosMaisVendidos.forEach(item => {
    linhas.push(linhaCSV([item.nome, item.quantidade, dinheiroCSV(item.valor)]));
  });

  linhas.push("");
  linhas.push(linhaCSV(["PRODUTOS / MATERIAIS MAIS USADOS"]));
  linhas.push(linhaCSV(["Produto / Material", "Quantidade usada", "Custo"]));
  r.produtosMaisUsados.forEach(item => {
    linhas.push(linhaCSV([item.nome, item.quantidade, dinheiroCSV(item.valor)]));
  });

  linhas.push("");
  linhas.push(linhaCSV(["CLIENTES MAIS ATENDIDAS"]));
  linhas.push(linhaCSV(["Cliente", "Atendimentos", "Total pago"]));
  r.clientesMaisAtendidas.forEach(item => {
    linhas.push(linhaCSV([item.nome, item.quantidade, dinheiroCSV(item.valor)]));
  });

  linhas.push("");
  linhas.push(linhaCSV(["FORMAS DE PAGAMENTO"]));
  linhas.push(linhaCSV(["Forma", "Quantidade", "Total"]));
  r.formasPagamento.forEach(item => {
    linhas.push(linhaCSV([item.nome, item.quantidade, dinheiroCSV(item.valor)]));
  });

  const csv = "\ufeff" + linhas.join("\n");

  baixarArquivoTexto(
    `relatorio-sistema-nail-${r.inicial}-a-${r.final}.csv`,
    csv,
    "text/csv;charset=utf-8"
  );
}

function nomeArquivoSeguro(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function limitarNomeAba(nome) {
  return String(nome || "Aba")
    .replace(/[\\/?*[\]:]/g, "")
    .substring(0, 31);
}

function nomeServicosAtendimento(atendimento) {
  if (Array.isArray(atendimento.itens) && atendimento.itens.length) {
    return atendimento.itens
      .map(item => item.servicoNome || "Serviço")
      .join(" + ");
  }

  return atendimento.servicoNome || "Serviço";
}

function aplicarFormatoPlanilha(ws, opcoes = {}) {
  if (!ws || !ws["!ref"]) return;

  const range = XLSX.utils.decode_range(ws["!ref"]);

  const colunasMoeda = opcoes.colunasMoeda || [];
  const colunasNumero = opcoes.colunasNumero || [];
  const linhaInicial = opcoes.linhaInicial || 0;

  for (let r = linhaInicial; r <= range.e.r; r++) {
    colunasMoeda.forEach(c => {
      const endereco = XLSX.utils.encode_cell({ r, c });
      const celula = ws[endereco];

      if (celula && typeof celula.v === "number") {
        celula.t = "n";
        celula.z = 'R$ #,##0.00;[Red]-R$ #,##0.00';
      }
    });

    colunasNumero.forEach(c => {
      const endereco = XLSX.utils.encode_cell({ r, c });
      const celula = ws[endereco];

      if (celula && typeof celula.v === "number") {
        celula.t = "n";
        celula.z = "0.00";
      }
    });
  }

  if (opcoes.filtroLinha !== undefined && opcoes.filtroLinha !== null) {
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({
        s: { r: opcoes.filtroLinha, c: 0 },
        e: { r: opcoes.filtroLinha, c: range.e.c }
      })
    };
  }
}

function criarAbaExcel(workbook, nomeAba, linhas, opcoes = {}) {
  const ws = XLSX.utils.aoa_to_sheet(linhas);

  if (opcoes.larguras) {
    ws["!cols"] = opcoes.larguras.map(largura => ({ wch: largura }));
  }

  aplicarFormatoPlanilha(ws, opcoes);

  XLSX.utils.book_append_sheet(workbook, ws, limitarNomeAba(nomeAba));
}

function exportarRelatorioXLSX() {
  atualizarRelatorios();

  if (typeof XLSX === "undefined") {
    alert("A biblioteca de exportação Excel não carregou. Verifique sua conexão com a internet ou o script XLSX no index.html.");
    return;
  }

  if (!ultimoRelatorioDados) {
    alert("Nenhum relatório disponível para exportar.");
    return;
  }

  const r = ultimoRelatorioDados;

  const atendimentosPeriodo = atendimentos
    .filter(a => dataNoIntervalo(a.data, r.inicial, r.final))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const financeiroPeriodo = financeiro
    .filter(f => dataNoIntervalo(f.data, r.inicial, r.final))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const movimentacoesPeriodo = movimentacoesEstoque
    .filter(m => dataNoIntervalo(m.data, r.inicial, r.final))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));

  const wb = XLSX.utils.book_new();

  criarAbaExcel(wb, "Resumo", [
    ["Sistema Nail Design"],
    [`Relatório de ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    ["RESUMO FINANCEIRO"],
    ["Indicador", "Valor"],
    ...r.resumoFinanceiro.map(item => [item.nome, numero(item.valor)])
  ], {
    larguras: [48, 18],
    colunasMoeda: [1],
    linhaInicial: 4,
    filtroLinha: 4
  });

  criarAbaExcel(wb, "Serviços", [
    ["Serviços Mais Vendidos"],
    [`Período: ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    ["Serviço", "Quantidade", "Total"],
    ...r.servicosMaisVendidos.map(item => [
      item.nome,
      numero(item.quantidade),
      numero(item.valor)
    ])
  ], {
    larguras: [42, 14, 16],
    colunasNumero: [1],
    colunasMoeda: [2],
    linhaInicial: 3,
    filtroLinha: 3
  });

  criarAbaExcel(wb, "Materiais", [
    ["Produtos / Materiais Mais Usados"],
    [`Período: ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    ["Produto / Material", "Quantidade Usada", "Custo"],
    ...r.produtosMaisUsados.map(item => [
      item.nome,
      numero(item.quantidade),
      numero(item.valor)
    ])
  ], {
    larguras: [38, 18, 16],
    colunasNumero: [1],
    colunasMoeda: [2],
    linhaInicial: 3,
    filtroLinha: 3
  });

  criarAbaExcel(wb, "Clientes", [
    ["Clientes Mais Atendidas"],
    [`Período: ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    ["Cliente", "Atendimentos", "Total Pago"],
    ...r.clientesMaisAtendidas.map(item => [
      item.nome,
      numero(item.quantidade),
      numero(item.valor)
    ])
  ], {
    larguras: [36, 16, 16],
    colunasNumero: [1],
    colunasMoeda: [2],
    linhaInicial: 3,
    filtroLinha: 3
  });

  criarAbaExcel(wb, "Pagamentos", [
    ["Recebimentos por Forma de Pagamento"],
    [`Período: ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    ["Forma de Pagamento", "Quantidade", "Total"],
    ...r.formasPagamento.map(item => [
      item.nome,
      numero(item.quantidade),
      numero(item.valor)
    ])
  ], {
    larguras: [28, 14, 16],
    colunasNumero: [1],
    colunasMoeda: [2],
    linhaInicial: 3,
    filtroLinha: 3
  });

  criarAbaExcel(wb, "Atendimentos", [
    ["Atendimentos do Período"],
    [`Período: ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    [
      "Data",
      "Hora",
      "Cliente",
      "Serviço(s)",
      "Forma",
      "Status",
      "Total Cliente",
      "Valor Líquido",
      "Materiais",
      "Lucro Real"
    ],
    ...atendimentosPeriodo.map(a => [
      formatarDataBR(a.data),
      a.hora || "",
      a.clienteNome || "",
      nomeServicosAtendimento(a),
      a.formaPagamento || "",
      a.status || "",
      numero(a.totalCliente || a.valorBase),
      numero(a.valorLiquido || a.totalCliente || a.valorBase),
      numero(a.custoMateriais || 0),
      numero(a.lucroReal || a.valorLucroReal || a.valorLiquido || a.totalCliente || 0)
    ])
  ], {
    larguras: [14, 10, 28, 48, 22, 16, 16, 16, 14, 16],
    colunasMoeda: [6, 7, 8, 9],
    linhaInicial: 3,
    filtroLinha: 3
  });

  criarAbaExcel(wb, "Financeiro", [
    ["Fluxo de Caixa do Período"],
    [`Período: ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    [
      "Data",
      "Tipo",
      "Categoria",
      "Descrição",
      "Cliente/Fornecedor",
      "Forma",
      "Valor",
      "Líquido",
      "Materiais",
      "Lucro Real",
      "Status",
      "Origem"
    ],
    ...financeiroPeriodo.map(f => [
      formatarDataBR(f.data),
      f.tipo || "",
      f.categoria || "",
      f.descricao || "",
      f.cliente || f.clienteFornecedor || "",
      f.formaPagamento || "",
      numero(f.valor),
      numero(f.valorLiquido || f.valor),
      numero(f.valorMateriais || f.custoMateriais || 0),
      f.tipo === "Saída" ? "" : numero(f.valorLucroReal ?? f.valorLiquido ?? f.valor),
      f.status || "",
      f.origem || ""
    ])
  ], {
    larguras: [14, 12, 24, 44, 28, 22, 16, 16, 14, 16, 16, 24],
    colunasMoeda: [6, 7, 8, 9],
    linhaInicial: 3,
    filtroLinha: 3
  });

  criarAbaExcel(wb, "Mov. Estoque", [
    ["Movimentações de Estoque"],
    [`Período: ${formatarDataBR(r.inicial)} até ${formatarDataBR(r.final)}`],
    [],
    [
      "Data",
      "Tipo",
      "Produto",
      "Quantidade",
      "Unidade",
      "Estoque Antes",
      "Estoque Depois",
      "Custo Unitário",
      "Custo Total",
      "Origem",
      "Observação"
    ],
    ...movimentacoesPeriodo.map(m => [
      formatarDataBR(m.data),
      m.tipo || "",
      m.produtoNome || "",
      numero(m.quantidade),
      m.unidade || "",
      numero(m.estoqueAnterior),
      numero(m.estoqueNovo),
      numero(m.custoUnitario || 0),
      numero(m.custoTotal || 0),
      m.origem || "",
      m.observacao || ""
    ])
  ], {
    larguras: [14, 14, 30, 14, 10, 16, 16, 16, 16, 24, 46],
    colunasNumero: [3, 5, 6],
    colunasMoeda: [7, 8],
    linhaInicial: 3,
    filtroLinha: 3
  });

  const nomeArquivo = `relatorio-sistema-nail-${nomeArquivoSeguro(r.inicial)}-a-${nomeArquivoSeguro(r.final)}.xlsx`;

  XLSX.writeFile(wb, nomeArquivo);
}

function atualizarRelatorios() {
  const tela = document.getElementById("relatorios");
  if (!tela) return;

  const { inicial, final } = obterIntervaloRelatorio();

  const atendimentosPeriodo = atendimentos.filter(a => dataNoIntervalo(a.data, inicial, final));
  const atendimentosConcluidos = atendimentosPeriodo.filter(a => a.status === "Concluído");

  const financeiroPeriodo = financeiro.filter(f => dataNoIntervalo(f.data, inicial, final));
  const entradasRecebidas = financeiroPeriodo.filter(f => f.tipo === "Entrada" && f.status === "Recebido");
  const saidasPagas = financeiroPeriodo.filter(f => f.tipo === "Saída" && f.status === "Pago");
  const saidasPendentes = financeiroPeriodo.filter(f => f.tipo === "Saída" && f.status !== "Pago");

  const faturamentoBruto = entradasRecebidas.reduce((s, f) => s + numero(f.valor), 0);
  const valorLiquido = entradasRecebidas.reduce((s, f) => s + numero(f.valorLiquido || f.valor), 0);
  const lucroRealAtendimentos = entradasRecebidas.reduce((s, f) => s + numero(f.valorLucroReal ?? f.valorLiquido ?? f.valor), 0);

  const descontos = atendimentosConcluidos.reduce((s, a) => {
    return s + numero(a.descontoServicos) + numero(a.descontoAutomatico) + numero(a.descontoManual);
  }, 0);

  const taxasCartao = atendimentosConcluidos.reduce((s, a) => s + numero(a.taxaMaquininha), 0);
  const materiaisUsados = atendimentosConcluidos.reduce((s, a) => s + numero(a.custoMateriais), 0);

  const comprasEstoque = financeiroPeriodo
    .filter(f => f.tipo === "Saída" && f.origem === "Reposição de Estoque")
    .reduce((s, f) => s + numero(f.valor), 0);

  const despesasPagas = saidasPagas.reduce((s, f) => s + numero(f.valor), 0);
  const despesasPendentes = saidasPendentes.reduce((s, f) => s + numero(f.valor), 0);

  const saldoCaixa = valorLiquido - despesasPagas;

  const aReceber = atendimentosPeriodo
    .filter(a => a.status === "Agendado" || a.status === "Confirmado")
    .reduce((s, a) => s + numero(a.totalCliente || a.valorBase), 0);

  const ticketMedio = atendimentosConcluidos.length ? faturamentoBruto / atendimentosConcluidos.length : 0;

  setTexto("relAtendimentosConcluidos", atendimentosConcluidos.length);
  setTexto("relFaturamentoBruto", dinheiro(faturamentoBruto));
  setTexto("relValorLiquido", dinheiro(valorLiquido));
  setTexto("relLucroReal", dinheiro(lucroRealAtendimentos));
  setTexto("relDescontos", dinheiro(descontos));
  setTexto("relTaxasCartao", dinheiro(taxasCartao));
  setTexto("relMateriaisUsados", dinheiro(materiaisUsados));
  setTexto("relComprasEstoque", dinheiro(comprasEstoque));
  setTexto("relDespesasPagas", dinheiro(despesasPagas));
  setTexto("relSaldoCaixa", dinheiro(saldoCaixa));
  setTexto("relTicketMedio", dinheiro(ticketMedio));
  setTexto("relAReceber", dinheiro(aReceber));

  const itensServicos = [];
  const itensMateriais = [];
  const clientesAtendidos = [];
  const formasPagamento = [];

  atendimentosConcluidos.forEach(a => {
    if (Array.isArray(a.itens) && a.itens.length) {
      a.itens.forEach(item => {
        itensServicos.push({
          nome: item.servicoNome || a.servicoNome || "Serviço",
          quantidade: 1,
          valor: numero(item.total)
        });
      });
    } else {
      itensServicos.push({
        nome: a.servicoNome || "Serviço",
        quantidade: 1,
        valor: numero(a.totalCliente || a.valorBase)
      });
    }

    if (Array.isArray(a.materiais)) {
      a.materiais.forEach(item => {
        itensMateriais.push({
          nome: item.produtoNome || "Material",
          quantidade: numero(item.quantidade),
          valor: numero(item.custoTotal)
        });
      });
    }

    clientesAtendidos.push({
      nome: a.clienteNome || "Cliente",
      quantidade: 1,
      valor: numero(a.totalCliente || a.valorBase)
    });

    formasPagamento.push({
      nome: a.formaPagamento || "Não informado",
      quantidade: 1,
      valor: numero(a.totalCliente || a.valorBase)
    });
  });

  const servicosMaisVendidos = somarPorChave(itensServicos, "nome", "valor").slice(0, 10);
  const produtosMaisUsados = somarPorChave(itensMateriais, "nome", "valor").slice(0, 10);
  const clientesMaisAtendidas = somarPorChave(clientesAtendidos, "nome", "valor").slice(0, 10);
  const formasPagamentoAgrupadas = somarPorChave(formasPagamento, "nome", "valor");

  renderTabelaSimples("relServicosMaisVendidos", [
    { titulo: "Serviço", campo: "nome" },
    { titulo: "Qtd.", campo: "quantidade", render: item => numero(item.quantidade) },
    { titulo: "Total", campo: "valor", render: item => dinheiro(item.valor) }
  ], servicosMaisVendidos);

  renderTabelaSimples("relProdutosMaisUsados", [
    { titulo: "Produto / Material", campo: "nome" },
    { titulo: "Qtd. Usada", campo: "quantidade", render: item => numero(item.quantidade) },
    { titulo: "Custo", campo: "valor", render: item => dinheiro(item.valor) }
  ], produtosMaisUsados);

  renderTabelaSimples("relClientesMaisAtendidas", [
    { titulo: "Cliente", campo: "nome" },
    { titulo: "Atendimentos", campo: "quantidade", render: item => numero(item.quantidade) },
    { titulo: "Total Pago", campo: "valor", render: item => dinheiro(item.valor) }
  ], clientesMaisAtendidas);

  renderTabelaSimples("relFormasPagamento", [
    { titulo: "Forma", campo: "nome" },
    { titulo: "Qtd.", campo: "quantidade", render: item => numero(item.quantidade) },
    { titulo: "Total", campo: "valor", render: item => dinheiro(item.valor) }
  ], formasPagamentoAgrupadas);

  const resumoFinanceiroRelatorio = [
    { nome: "Entradas recebidas", valor: faturamentoBruto },
    { nome: "Valor líquido recebido", valor: valorLiquido },
    { nome: "Lucro real dos atendimentos", valor: lucroRealAtendimentos },
    { nome: "Descontos concedidos", valor: descontos },
    { nome: "Taxas de cartão", valor: taxasCartao },
    { nome: "Materiais usados nos atendimentos", valor: materiaisUsados },
    { nome: "Compras de estoque", valor: comprasEstoque },
    { nome: "Despesas pagas", valor: despesasPagas },
    { nome: "Despesas pendentes", valor: despesasPendentes },
    { nome: "Saldo de caixa", valor: saldoCaixa },
    { nome: "A receber de atendimentos agendados/confirmados", valor: aReceber }
  ];

  renderTabelaSimples("relResumoFinanceiro", [
    { titulo: "Indicador", campo: "nome" },
    { titulo: "Valor", campo: "valor", render: item => dinheiro(item.valor) }
  ], resumoFinanceiroRelatorio);

  ultimoRelatorioDados = {
    inicial,
    final,
    atendimentosConcluidos: atendimentosConcluidos.length,
    faturamentoBruto,
    valorLiquido,
    lucroRealAtendimentos,
    descontos,
    taxasCartao,
    materiaisUsados,
    comprasEstoque,
    despesasPagas,
    despesasPendentes,
    saldoCaixa,
    ticketMedio,
    aReceber,
    servicosMaisVendidos,
    produtosMaisUsados,
    clientesMaisAtendidas,
    formasPagamento: formasPagamentoAgrupadas,
    resumoFinanceiro: resumoFinanceiroRelatorio
  };

  setTexto(
    "relatorioPeriodoImpressao",
    `Período: ${formatarDataBR(inicial)} até ${formatarDataBR(final)}`
  );

  atualizarGraficosRelatorios({
    faturamentoBruto,
    valorLiquido,
    despesasPagas,
    saldoCaixa,
    lucroRealAtendimentos,
    materiaisUsados,
    taxasCartao,
    descontos,
    comprasEstoque,
    servicosMaisVendidos,
    produtosMaisUsados,
    clientesMaisAtendidas,
    formasPagamento: formasPagamentoAgrupadas
  });
}

/* CLIENTES */

async function salvarCliente() {
  const id = document.getElementById("clienteId").value;

  const cliente = {
    nome: document.getElementById("clienteNome").value.trim(),
    telefone: document.getElementById("clienteTelefone").value.trim(),
    email: document.getElementById("clienteEmail").value.trim(),
    aniversario: document.getElementById("clienteAniversario").value,
    observacoes: document.getElementById("clienteObs").value.trim(),
    ativo: document.getElementById("clienteAtivo").checked,
    atualizadoEm: serverTimestamp()
  };

  if (!cliente.nome) {
    alert("Informe o nome da cliente.");
    return;
  }

  if (id) {
    await updateDoc(doc(db, "clientes", id), cliente);
    alert("Cliente atualizada com sucesso!");
  } else {
    cliente.criadoEm = serverTimestamp();
    await addDoc(collection(db, "clientes"), cliente);
    alert("Cliente cadastrada com sucesso!");
  }

  limparCliente();
  await carregarClientes();
  atualizarDashboard();
}

window.limparCliente = function() {
  document.getElementById("clienteId").value = "";
  document.getElementById("clienteNome").value = "";
  document.getElementById("clienteTelefone").value = "";
  document.getElementById("clienteEmail").value = "";
  document.getElementById("clienteAniversario").value = "";
  document.getElementById("clienteObs").value = "";
  document.getElementById("clienteAtivo").checked = true;
};

async function carregarClientes() {
  const snap = await getDocs(query(collection(db, "clientes"), orderBy("nome")));
  clientes = [];

  snap.forEach(docSnap => clientes.push({ id: docSnap.id, ...docSnap.data() }));

  renderClientes();
  preencherClientesAgenda();
}

function renderClientes() {
  const div = document.getElementById("listaClientes");
  if (!div) return;

  if (clientes.length === 0) {
    div.innerHTML = "<p>Nenhuma cliente cadastrada.</p>";
    return;
  }

  div.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Telefone</th>
          <th>E-mail</th>
          <th>Ativo</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${clientes.map(c => `
          <tr>
            <td>${escapar(c.nome)}</td>
            <td>${escapar(c.telefone)}</td>
            <td>${escapar(c.email)}</td>
            <td>${c.ativo ? "Sim" : "Não"}</td>
            <td class="acoes">
              <button class="btn-acao btn-editar" onclick="editarCliente('${c.id}')">Editar</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.editarCliente = function(id) {
  const c = clientes.find(item => item.id === id);
  if (!c) return;

  document.getElementById("clienteId").value = c.id;
  document.getElementById("clienteNome").value = c.nome || "";
  document.getElementById("clienteTelefone").value = c.telefone || "";
  document.getElementById("clienteEmail").value = c.email || "";
  document.getElementById("clienteAniversario").value = c.aniversario || "";
  document.getElementById("clienteObs").value = c.observacoes || "";
  document.getElementById("clienteAtivo").checked = c.ativo !== false;
};

function preencherClientesAgenda() {
  const select = document.getElementById("agendaCliente");
  if (!select) return;

  const anterior = select.value;
  select.innerHTML = `<option value="">Selecione...</option>`;

  clientes
    .filter(c => c.ativo !== false)
    .forEach(c => select.innerHTML += `<option value="${c.id}">${escapar(c.nome)}</option>`);

  if (anterior) select.value = anterior;
}

/* SERVIÇOS */

async function salvarServico() {
  const id = document.getElementById("servicoId").value;

  const servico = {
    nome: document.getElementById("servicoNome").value.trim(),
    categoria: document.getElementById("servicoCategoria").value.trim(),
    preco: numero(document.getElementById("servicoPreco").value),
    duracao: document.getElementById("servicoDuracao").value.trim(),
    descricao: document.getElementById("servicoDescricao").value.trim(),
    ativo: document.getElementById("servicoAtivo").checked,
    atualizadoEm: serverTimestamp()
  };

  if (!servico.nome) {
    alert("Informe o nome do serviço.");
    return;
  }

  if (servico.preco <= 0) {
    alert("Informe o preço do serviço.");
    return;
  }

  if (id) {
    await updateDoc(doc(db, "servicos", id), servico);
    alert("Serviço atualizado com sucesso!");
  } else {
    servico.criadoEm = serverTimestamp();
    await addDoc(collection(db, "servicos"), servico);
    alert("Serviço cadastrado com sucesso!");
  }

  limparServico();
  await carregarServicos();
  atualizarDashboard();
}

window.limparServico = function() {
  document.getElementById("servicoId").value = "";
  document.getElementById("servicoNome").value = "";
  document.getElementById("servicoCategoria").value = "Unhas";
  document.getElementById("servicoPreco").value = "";
  document.getElementById("servicoDuracao").value = "";
  document.getElementById("servicoDescricao").value = "";
  document.getElementById("servicoAtivo").checked = true;
};

async function carregarServicos() {
  const snap = await getDocs(query(collection(db, "servicos"), orderBy("nome")));
  servicos = [];

  snap.forEach(docSnap => servicos.push({ id: docSnap.id, ...docSnap.data() }));

  renderServicos();
}

function renderServicos() {
  const div = document.getElementById("listaServicos");
  if (!div) return;

  if (servicos.length === 0) {
    div.innerHTML = "<p>Nenhum serviço cadastrado.</p>";
    return;
  }

  div.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Serviço</th>
          <th>Categoria</th>
          <th>Preço</th>
          <th>Duração</th>
          <th>Ativo</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${servicos.map(s => `
          <tr>
            <td>${escapar(s.nome)}</td>
            <td>${escapar(s.categoria)}</td>
            <td>${dinheiro(s.preco)}</td>
            <td>${escapar(s.duracao)}</td>
            <td>${s.ativo ? "Sim" : "Não"}</td>
            <td class="acoes">
              <button class="btn-acao btn-editar" onclick="editarServico('${s.id}')">Editar</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.editarServico = function(id) {
  const s = servicos.find(item => item.id === id);
  if (!s) return;

  document.getElementById("servicoId").value = s.id;
  document.getElementById("servicoNome").value = s.nome || "";
  document.getElementById("servicoCategoria").value = s.categoria || "";
  document.getElementById("servicoPreco").value = s.preco || 0;
  document.getElementById("servicoDuracao").value = s.duracao || "";
  document.getElementById("servicoDescricao").value = s.descricao || "";
  document.getElementById("servicoAtivo").checked = s.ativo !== false;
};

/* FORNECEDORES */

async function salvarFornecedor() {
  const id = document.getElementById("fornecedorId").value;

  const fornecedor = {
    nome: document.getElementById("fornecedorNome").value.trim(),
    telefone: document.getElementById("fornecedorTelefone").value.trim(),
    email: document.getElementById("fornecedorEmail").value.trim(),
    contato: document.getElementById("fornecedorContato").value.trim(),
    observacoes: document.getElementById("fornecedorObs").value.trim(),
    ativo: document.getElementById("fornecedorAtivo").checked,
    atualizadoEm: serverTimestamp()
  };

  if (!fornecedor.nome) {
    alert("Informe o nome do fornecedor.");
    return;
  }

  if (id) {
    await updateDoc(doc(db, "fornecedores", id), fornecedor);
    alert("Fornecedor atualizado com sucesso!");
  } else {
    fornecedor.criadoEm = serverTimestamp();
    await addDoc(collection(db, "fornecedores"), fornecedor);
    alert("Fornecedor cadastrado com sucesso!");
  }

  limparFornecedor();
  await carregarFornecedores();
  await carregarProdutos();
}

window.limparFornecedor = function() {
  document.getElementById("fornecedorId").value = "";
  document.getElementById("fornecedorNome").value = "";
  document.getElementById("fornecedorTelefone").value = "";
  document.getElementById("fornecedorEmail").value = "";
  document.getElementById("fornecedorContato").value = "";
  document.getElementById("fornecedorObs").value = "";
  document.getElementById("fornecedorAtivo").checked = true;
};

async function carregarFornecedores() {
  const snap = await getDocs(query(collection(db, "fornecedores"), orderBy("nome")));
  fornecedores = [];

  snap.forEach(docSnap => fornecedores.push({ id: docSnap.id, ...docSnap.data() }));

  renderFornecedores();
  preencherFornecedoresProduto();
}

function renderFornecedores() {
  const div = document.getElementById("listaFornecedores");
  if (!div) return;

  if (fornecedores.length === 0) {
    div.innerHTML = "<p>Nenhum fornecedor cadastrado.</p>";
    return;
  }

  div.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fornecedor</th>
          <th>Telefone</th>
          <th>E-mail</th>
          <th>Contato</th>
          <th>Ativo</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${fornecedores.map(f => `
          <tr>
            <td>${escapar(f.nome)}</td>
            <td>${escapar(f.telefone)}</td>
            <td>${escapar(f.email)}</td>
            <td>${escapar(f.contato)}</td>
            <td>${f.ativo ? "Sim" : "Não"}</td>
            <td class="acoes">
              <button class="btn-acao btn-editar" onclick="editarFornecedor('${f.id}')">Editar</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.editarFornecedor = function(id) {
  const f = fornecedores.find(item => item.id === id);
  if (!f) return;

  document.getElementById("fornecedorId").value = f.id;
  document.getElementById("fornecedorNome").value = f.nome || "";
  document.getElementById("fornecedorTelefone").value = f.telefone || "";
  document.getElementById("fornecedorEmail").value = f.email || "";
  document.getElementById("fornecedorContato").value = f.contato || "";
  document.getElementById("fornecedorObs").value = f.observacoes || "";
  document.getElementById("fornecedorAtivo").checked = f.ativo !== false;
};

function preencherFornecedoresProduto() {
  const select = document.getElementById("produtoFornecedor");
  if (!select) return;

  const anterior = select.value;
  select.innerHTML = `<option value="">Sem fornecedor</option>`;

  fornecedores
    .filter(f => f.ativo !== false)
    .forEach(f => select.innerHTML += `<option value="${f.id}">${escapar(f.nome)}</option>`);

  if (anterior) select.value = anterior;
}

/* PRODUTOS */

async function salvarProduto() {
  const id = document.getElementById("produtoId").value;
  const fornecedorId = document.getElementById("produtoFornecedor").value;
  const fornecedor = fornecedores.find(f => f.id === fornecedorId);

  const produto = {
    nome: document.getElementById("produtoNome").value.trim(),
    categoria: document.getElementById("produtoCategoria").value.trim(),
    fornecedorId,
    fornecedorNome: fornecedor ? fornecedor.nome : "",
    unidade: document.getElementById("produtoUnidade").value.trim(),
    quantidade: numero(document.getElementById("produtoQuantidade").value),
    custoUnitario: numero(document.getElementById("produtoCustoUnitario").value),
    estoqueMinimo: numero(document.getElementById("produtoEstoqueMinimo").value),
    ativo: document.getElementById("produtoAtivo").checked,
    atualizadoEm: serverTimestamp()
  };

  if (!produto.nome) {
    alert("Informe o nome do produto.");
    return;
  }

  if (id) {
    await updateDoc(doc(db, "produtos", id), produto);
    alert("Produto atualizado com sucesso!");
  } else {
    produto.criadoEm = serverTimestamp();
    await addDoc(collection(db, "produtos"), produto);
    alert("Produto cadastrado com sucesso!");
  }

  limparProduto();
  await carregarProdutos();
  atualizarDashboard();
}

window.limparProduto = function() {
  document.getElementById("produtoId").value = "";
  document.getElementById("produtoNome").value = "";
  document.getElementById("produtoCategoria").value = "Material de unha";
  document.getElementById("produtoFornecedor").value = "";
  document.getElementById("produtoUnidade").value = "un";
  document.getElementById("produtoQuantidade").value = 0;
  document.getElementById("produtoCustoUnitario").value = 0;
  document.getElementById("produtoEstoqueMinimo").value = 0;
  document.getElementById("produtoAtivo").checked = true;
};

async function carregarProdutos() {
  const snap = await getDocs(query(collection(db, "produtos"), orderBy("nome")));
  produtos = [];

  snap.forEach(docSnap => produtos.push({ id: docSnap.id, ...docSnap.data() }));

  renderProdutos();
}

function badgeEstoqueProduto(produto) {
  const quantidade = numero(produto.quantidade);
  const minimo = numero(produto.estoqueMinimo);

  if (quantidade <= minimo) {
    return `<span class="status-badge status-vermelho">Estoque Baixo</span>`;
  }

  return `<span class="status-badge status-verde">Estoque OK</span>`;
}

function renderProdutos() {
  const div = document.getElementById("listaProdutos");
  if (!div) return;

  if (produtos.length === 0) {
    div.innerHTML = "<p>Nenhum produto cadastrado.</p>";
    return;
  }

  div.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Produto</th>
          <th>Categoria</th>
          <th>Fornecedor</th>
          <th>Estoque</th>
          <th>Custo Unit.</th>
          <th>Estoque Mín.</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${produtos.map(p => `
          <tr>
            <td>${escapar(p.nome)}</td>
            <td>${escapar(p.categoria)}</td>
            <td>${escapar(p.fornecedorNome)}</td>
            <td>${numero(p.quantidade)} ${escapar(p.unidade || "")}</td>
            <td>${dinheiro(p.custoUnitario)}</td>
            <td>${numero(p.estoqueMinimo)} ${escapar(p.unidade || "")}</td>
            <td>${badgeEstoqueProduto(p)}</td>
            <td class="acoes">
              <button class="btn-acao btn-editar" onclick="editarProduto('${p.id}')">Editar</button>
              <button class="btn-acao btn-repor" onclick="abrirReposicaoEstoque('${p.id}')">Repor Estoque</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

window.editarProduto = function(id) {
  const p = produtos.find(item => item.id === id);
  if (!p) return;

  document.getElementById("produtoId").value = p.id;
  document.getElementById("produtoNome").value = p.nome || "";
  document.getElementById("produtoCategoria").value = p.categoria || "";
  document.getElementById("produtoFornecedor").value = p.fornecedorId || "";
  document.getElementById("produtoUnidade").value = p.unidade || "un";
  document.getElementById("produtoQuantidade").value = numero(p.quantidade);
  document.getElementById("produtoCustoUnitario").value = numero(p.custoUnitario);
  document.getElementById("produtoEstoqueMinimo").value = numero(p.estoqueMinimo);
  document.getElementById("produtoAtivo").checked = p.ativo !== false;
};

window.abrirReposicaoEstoque = function(id) {
  const produto = produtos.find(p => p.id === id);

  if (!produto) {
    alert("Produto não encontrado.");
    return;
  }

  document.getElementById("reposicaoProdutoId").value = produto.id;
  document.getElementById("reposicaoProdutoNome").value = produto.nome || "";
  document.getElementById("reposicaoEstoqueAtual").value = `${numero(produto.quantidade)} ${produto.unidade || ""}`;
  document.getElementById("reposicaoQuantidade").value = 0;
  document.getElementById("reposicaoValorTotal").value = 0;
  document.getElementById("reposicaoPagamento").value = "PIX";
  document.getElementById("reposicaoStatus").value = "Pago";

  definirDataHoje();

  document.getElementById("modalReposicaoEstoque").classList.remove("escondido");
};

window.fecharReposicaoEstoque = function() {
  const modal = document.getElementById("modalReposicaoEstoque");
  if (modal) modal.classList.add("escondido");
};

async function salvarReposicaoEstoque() {
  const produtoId = document.getElementById("reposicaoProdutoId").value;
  const produto = produtos.find(p => p.id === produtoId);

  if (!produto) {
    alert("Produto não encontrado.");
    return;
  }

  const quantidadeComprada = numero(document.getElementById("reposicaoQuantidade").value);
  const valorTotal = numero(document.getElementById("reposicaoValorTotal").value);
  const data = document.getElementById("reposicaoData").value || dataHoje();
  const formaPagamento = document.getElementById("reposicaoPagamento").value;
  const status = document.getElementById("reposicaoStatus").value;

  if (quantidadeComprada <= 0) {
    alert("Informe a quantidade comprada.");
    return;
  }

  if (valorTotal < 0) {
    alert("O valor total da compra não pode ser negativo.");
    return;
  }

  const estoqueAnterior = numero(produto.quantidade);
  const estoqueNovo = arredondar(estoqueAnterior + quantidadeComprada);
  const custoUnitarioCompra = quantidadeComprada > 0 ? arredondar(valorTotal / quantidadeComprada) : 0;

  let financeiroId = "";

  if (valorTotal > 0) {
    const financeiroRef = await addDoc(collection(db, "financeiro"), {
      tipo: "Saída",
      data,
      categoria: "Compra de Material",
      descricao: `Reposição de estoque - ${produto.nome}`,
      cliente: produto.fornecedorNome || "",
      formaPagamento,
      valor: arredondar(valorTotal),
      valorLiquido: arredondar(valorTotal),
      status,
      origem: "Reposição de Estoque",
      produtoId: produto.id,
      produtoNome: produto.nome,
      quantidade: arredondar(quantidadeComprada),
      custoUnitarioCompra,
      criadoEm: serverTimestamp()
    });

    financeiroId = financeiroRef.id;
  }

  await updateDoc(doc(db, "produtos", produto.id), {
    quantidade: estoqueNovo,
    atualizadoEm: serverTimestamp()
  });

  produto.quantidade = estoqueNovo;

  await registrarMovimentacaoEstoque({
    tipo: "Entrada",
    data,
    produtoId: produto.id,
    produtoNome: produto.nome,
    quantidade: arredondar(quantidadeComprada),
    unidade: produto.unidade || "",
    estoqueAnterior: arredondar(estoqueAnterior),
    estoqueNovo,
    custoUnitario: custoUnitarioCompra,
    custoTotal: arredondar(valorTotal),
    origem: "Reposição de Estoque",
    financeiroId,
    observacao: "Reposição manual pelo módulo Produtos"
  });

  fecharReposicaoEstoque();

  alert("Estoque reposto e compra lançada no financeiro com sucesso!");

  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarFinanceiro();
  atualizarDashboard();
}

async function registrarMovimentacaoEstoque(dados) {
  await addDoc(collection(db, "movimentacoesEstoque"), {
    ...dados,
    criadoEm: serverTimestamp()
  });
}

async function carregarMovimentacoesEstoque() {
  const div = document.getElementById("listaMovimentacoesEstoque");

  if (!div) return;

  const snap = await getDocs(query(collection(db, "movimentacoesEstoque"), orderBy("data", "desc")));
  movimentacoesEstoque = [];

  snap.forEach(docSnap => {
    movimentacoesEstoque.push({
      id: docSnap.id,
      ...docSnap.data()
    });
  });

  renderMovimentacoesEstoque();
}

function renderMovimentacoesEstoque() {
  const div = document.getElementById("listaMovimentacoesEstoque");
  if (!div) return;

  if (movimentacoesEstoque.length === 0) {
    div.innerHTML = "<p>Nenhuma movimentação de estoque registrada.</p>";
    return;
  }

  div.innerHTML = `
    <table class="tabela-movimentacoes-estoque">
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Produto</th>
          <th>Qtd.</th>
          <th>Estoque Antes</th>
          <th>Estoque Depois</th>
          <th>Custo Total</th>
          <th>Origem</th>
        </tr>
      </thead>
      <tbody>
        ${movimentacoesEstoque.slice(0, 30).map(m => `
          <tr>
            <td>${escapar(m.data)}</td>
            <td>${badgeTipoMovimentacaoEstoque(m.tipo)}</td>
            <td>${escapar(m.produtoNome)}</td>
            <td>${numero(m.quantidade)} ${escapar(m.unidade || "")}</td>
            <td>${numero(m.estoqueAnterior)} ${escapar(m.unidade || "")}</td>
            <td>${numero(m.estoqueNovo)} ${escapar(m.unidade || "")}</td>
            <td>${dinheiro(m.custoTotal || 0)}</td>
            <td>${escapar(m.origem)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function badgeTipoMovimentacaoEstoque(tipo) {
  const classe = tipo === "Entrada" ? "status-verde" : "status-vermelho";
  return `<span class="status-badge ${classe}">${escapar(tipo)}</span>`;
}

/* AGENDA - SERVIÇOS */

function nomeServicoSelect(nome) {
  return String(nome || "").replace(/\s*-\s*R\$\s*[\d.,]+.*$/i, "").trim();
}

function opcoesServicosHtml(servicoSelecionadoId = "") {
  let html = `<option value="">Selecione...</option>`;

  servicos
    .filter(s => s.ativo !== false)
    .forEach(s => {
      const selected = String(s.id) === String(servicoSelecionadoId) ? "selected" : "";
      html += `<option value="${s.id}" ${selected}>${escapar(nomeServicoSelect(s.nome))}</option>`;
    });

  return html;
}

window.adicionarLinhaServicoAtendimento = function(item = null, recalcular = true) {
  const tbody = document.getElementById("listaServicosAtendimento");
  if (!tbody) return;

  const tr = document.createElement("tr");
  const servicoId = item?.servicoId || "";
  const preco = numero(item?.preco);
  const desconto = numero(item?.desconto);
  const total = Math.max(preco - desconto, 0);

  tr.innerHTML = `
    <td>
      <select class="item-servico" onchange="servicoAtendimentoAlterado(this)">
        ${opcoesServicosHtml(servicoId)}
      </select>
    </td>
    <td>
      <input class="item-preco" type="number" value="${preco}" oninput="window.atualizarSimulacaoAgenda()" onchange="window.atualizarSimulacaoAgenda()">
    </td>
    <td>
      <input class="item-desconto" type="number" value="${desconto}" oninput="window.atualizarSimulacaoAgenda()" onchange="window.atualizarSimulacaoAgenda()">
    </td>
    <td>
      <input class="item-total" type="text" value="${dinheiro(total)}" readonly>
    </td>
    <td>
      <button type="button" class="btn-acao btn-excluir" onclick="removerLinhaServicoAtendimento(this)">Remover</button>
    </td>
  `;

  tbody.appendChild(tr);
  if (recalcular) atualizarSimulacaoAgenda();
};

window.servicoAtendimentoAlterado = function(select) {
  const tr = select.closest("tr");
  const servico = servicos.find(s => String(s.id) === String(select.value));

  if (tr && servico) {
    tr.querySelector(".item-preco").value = numero(servico.preco);
    tr.querySelector(".item-desconto").value = 0;
  }

  atualizarSimulacaoAgenda();
};

window.removerLinhaServicoAtendimento = function(botao) {
  const tr = botao.closest("tr");
  if (tr) tr.remove();

  const tbody = document.getElementById("listaServicosAtendimento");
  if (tbody && tbody.children.length === 0) adicionarLinhaServicoAtendimento(null, false);

  atualizarSimulacaoAgenda();
};

function limparTabelaServicosAtendimento() {
  const tbody = document.getElementById("listaServicosAtendimento");
  if (tbody) tbody.innerHTML = "";
}

function garantirLinhaServicoAtendimento() {
  const tbody = document.getElementById("listaServicosAtendimento");
  if (tbody && tbody.children.length === 0) adicionarLinhaServicoAtendimento(null, false);
}

function obterItensServicosAtendimento() {
  const itens = [];
  const linhas = document.querySelectorAll("#listaServicosAtendimento tr");

  linhas.forEach(tr => {
    const select = tr.querySelector(".item-servico");
    const precoInput = tr.querySelector(".item-preco");
    const descontoInput = tr.querySelector(".item-desconto");
    const totalInput = tr.querySelector(".item-total");

    const servicoId = select?.value || "";
    const servico = servicos.find(s => String(s.id) === String(servicoId));

    const preco = numero(precoInput?.value);
    const desconto = numero(descontoInput?.value);
    const total = Math.max(preco - desconto, 0);

    if (totalInput) totalInput.value = dinheiro(total);

    if (servicoId && servico) {
      itens.push({
        servicoId,
        servicoNome: servico.nome,
        preco: arredondar(preco),
        desconto: arredondar(desconto),
        total: arredondar(total)
      });
    }
  });

  return itens;
}

/* AGENDA - MATERIAIS */

function opcoesProdutosHtml(produtoSelecionadoId = "") {
  let html = `<option value="">Selecione...</option>`;

  produtos
    .filter(p => p.ativo !== false)
    .forEach(p => {
      const selected = String(p.id) === String(produtoSelecionadoId) ? "selected" : "";
      html += `<option value="${p.id}" ${selected}>${escapar(p.nome)} - ${numero(p.quantidade)} ${escapar(p.unidade || "")}</option>`;
    });

  return html;
}

window.adicionarLinhaMaterialAtendimento = function(item = null, recalcular = true) {
  const tbody = document.getElementById("listaMateriaisAtendimento");
  if (!tbody) return;

  const tr = document.createElement("tr");

  const produtoId = item?.produtoId || "";
  const quantidade = numero(item?.quantidade);
  const custoUnitario = numero(item?.custoUnitario);
  const custoTotal = quantidade * custoUnitario;

  tr.innerHTML = `
    <td>
      <select class="item-produto" onchange="materialAtendimentoAlterado(this)">
        ${opcoesProdutosHtml(produtoId)}
      </select>
    </td>
    <td>
      <input class="item-qtd-material" type="number" step="0.01" value="${quantidade}" oninput="window.atualizarSimulacaoAgenda()" onchange="window.atualizarSimulacaoAgenda()">
    </td>
    <td>
      <input class="item-custo-unitario" type="number" step="0.01" value="${custoUnitario}" oninput="window.atualizarSimulacaoAgenda()" onchange="window.atualizarSimulacaoAgenda()">
    </td>
    <td>
      <input class="item-custo-total" type="text" value="${dinheiro(custoTotal)}" readonly>
    </td>
    <td>
      <button type="button" class="btn-acao btn-excluir" onclick="removerLinhaMaterialAtendimento(this)">Remover</button>
    </td>
  `;

  tbody.appendChild(tr);
  if (recalcular) atualizarSimulacaoAgenda();
};

window.materialAtendimentoAlterado = function(select) {
  const tr = select.closest("tr");
  const produto = produtos.find(p => String(p.id) === String(select.value));

  if (tr && produto) {
    tr.querySelector(".item-qtd-material").value = 1;
    tr.querySelector(".item-custo-unitario").value = numero(produto.custoUnitario);
  }

  atualizarSimulacaoAgenda();
};

window.removerLinhaMaterialAtendimento = function(botao) {
  const tr = botao.closest("tr");
  if (tr) tr.remove();

  atualizarSimulacaoAgenda();
};

function limparTabelaMateriaisAtendimento() {
  const tbody = document.getElementById("listaMateriaisAtendimento");
  if (tbody) tbody.innerHTML = "";
}

function obterMateriaisAtendimento() {
  const itens = [];
  const linhas = document.querySelectorAll("#listaMateriaisAtendimento tr");

  linhas.forEach(tr => {
    const select = tr.querySelector(".item-produto");
    const qtdInput = tr.querySelector(".item-qtd-material");
    const custoInput = tr.querySelector(".item-custo-unitario");
    const totalInput = tr.querySelector(".item-custo-total");

    const produtoId = select?.value || "";
    const produto = produtos.find(p => String(p.id) === String(produtoId));

    const quantidade = numero(qtdInput?.value);
    const custoUnitario = numero(custoInput?.value);
    const custoTotal = quantidade * custoUnitario;

    if (totalInput) totalInput.value = dinheiro(custoTotal);

    if (produtoId && produto && quantidade > 0) {
      itens.push({
        produtoId,
        produtoNome: produto.nome,
        quantidade: arredondar(quantidade),
        unidade: produto.unidade || "",
        custoUnitario: arredondar(custoUnitario),
        custoTotal: arredondar(custoTotal)
      });
    }
  });

  return itens;
}

/* AGENDA - CÁLCULO */

function obterResumoAgenda() {
  const itens = obterItensServicosAtendimento();
  const materiais = obterMateriaisAtendimento();

  const valorBruto = itens.reduce((s, i) => s + numero(i.preco), 0);
  const descontoServicos = itens.reduce((s, i) => s + numero(i.desconto), 0);
  const subtotal = itens.reduce((s, i) => s + numero(i.total), 0);
  const custoMateriais = materiais.reduce((s, m) => s + numero(m.custoTotal), 0);

  return {
    itens,
    materiais,
    valorBruto: arredondar(valorBruto),
    descontoServicos: arredondar(descontoServicos),
    subtotal: arredondar(subtotal),
    custoMateriais: arredondar(custoMateriais),
    nomesServicos: itens.map(i => i.servicoNome).join(" + ")
  };
}

function atualizarSimulacaoAgenda() {
  garantirLinhaServicoAtendimento();

  const resumo = obterResumoAgenda();
  const forma = document.getElementById("agendaPagamento")?.value || "PIX";
  const descontoManual = numero(document.getElementById("agendaDescontoManual")?.value);

  const calculo = calcularPagamento(resumo.subtotal, forma, descontoManual);

  if (forma === "Cartão de Crédito" || forma === "Cartão de Débito") {
    const desc = document.getElementById("agendaDescontoManual");
    if (desc) desc.value = 0;
  }

  const lucroReal = calculo.valorLiquido - resumo.custoMateriais;

  setValor("agendaValorBase", dinheiro(calculo.valorBase));
  setValor("agendaDescontoAuto", dinheiro(calculo.descontoAutomatico));
  setValor("agendaTaxa", dinheiro(calculo.taxaMaquininha));
  setValor("agendaTotalCliente", dinheiro(calculo.totalCliente));
  setValor("agendaValorLiquido", dinheiro(calculo.valorLiquido));
  setValor("agendaCustoMateriais", dinheiro(resumo.custoMateriais));
  setValor("agendaLucroReal", dinheiro(lucroReal));

  return {
    calculo,
    resumo,
    lucroReal: arredondar(lucroReal)
  };
}

window.atualizarSimulacaoAgenda = atualizarSimulacaoAgenda;

/* AGENDA - SALVAR */

async function salvarAtendimento() {
  const clienteId = document.getElementById("agendaCliente").value;
  const cliente = clientes.find(c => c.id === clienteId);

  if (!cliente) {
    alert("Selecione uma cliente.");
    return;
  }

  const { calculo, resumo, lucroReal } = atualizarSimulacaoAgenda();

  if (!resumo.itens.length) {
    alert("Adicione pelo menos um serviço.");
    return;
  }

  const primeiroItem = resumo.itens[0];

  const atendimento = {
    clienteId,
    clienteNome: cliente.nome,
    itens: resumo.itens,
    materiais: resumo.materiais,
    servicoId: primeiroItem.servicoId,
    servicoNome: resumo.nomesServicos,
    valorBruto: resumo.valorBruto,
    descontoServicos: resumo.descontoServicos,
    valorBase: calculo.valorBase,
    formaPagamento: document.getElementById("agendaPagamento").value,
    taxaPercentual: calculo.taxaPercentual,
    descontoAutomatico: calculo.descontoAutomatico,
    descontoManual: calculo.descontoManual,
    totalCliente: calculo.totalCliente,
    taxaMaquininha: calculo.taxaMaquininha,
    valorLiquido: calculo.valorLiquido,
    custoMateriais: resumo.custoMateriais,
    lucroReal,
    data: document.getElementById("agendaData").value,
    hora: document.getElementById("agendaHora").value,
    status: document.getElementById("agendaStatus").value,
    atualizadoEm: serverTimestamp()
  };

  if (atendimentoEditandoId) {
    const antigo = atendimentos.find(a => a.id === atendimentoEditandoId);

    if (antigo?.financeiroId) atendimento.financeiroId = antigo.financeiroId;
    if (antigo?.estoqueBaixado) atendimento.estoqueBaixado = true;

    await updateDoc(doc(db, "atendimentos", atendimentoEditandoId), atendimento);

    if (atendimento.status === "Concluído") {
      await concluirAtendimentoInterno(atendimentoEditandoId, false);
    } else {
      if (antigo?.estoqueBaixado) await devolverEstoqueMateriais(antigo);
      if (antigo?.financeiroId) await deleteDoc(doc(db, "financeiro", antigo.financeiroId));

      await updateDoc(doc(db, "atendimentos", atendimentoEditandoId), {
        financeiroId: "",
        estoqueBaixado: false,
        atualizadoEm: serverTimestamp()
      });
    }

    alert("Atendimento atualizado com sucesso!");
  } else {
    atendimento.criadoEm = serverTimestamp();
    atendimento.estoqueBaixado = false;

    const ref = await addDoc(collection(db, "atendimentos"), atendimento);

    if (atendimento.status === "Concluído") {
      await carregarAtendimentos();
      await concluirAtendimentoInterno(ref.id, false);
    }

    alert("Atendimento salvo com sucesso!");
  }

  limparAtendimento();
  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarAtendimentos();
  await carregarFinanceiro();
  atualizarDashboard();
}

function limparAtendimento() {
  atendimentoEditandoId = null;

  document.getElementById("agendaCliente").value = "";
  document.getElementById("agendaHora").value = "";
  document.getElementById("agendaPagamento").value = "PIX";
  document.getElementById("agendaStatus").value = "Agendado";
  document.getElementById("agendaDescontoManual").value = 0;

  limparTabelaServicosAtendimento();
  limparTabelaMateriaisAtendimento();
  adicionarLinhaServicoAtendimento(null, false);

  const btn = document.getElementById("btnSalvarAtendimento");
  if (btn) btn.textContent = "Salvar Atendimento";

  definirDataHoje();
  atualizarSimulacaoAgenda();
}

async function carregarAtendimentos() {
  const snap = await getDocs(query(collection(db, "atendimentos"), orderBy("data", "desc")));
  atendimentos = [];

  snap.forEach(docSnap => atendimentos.push({ id: docSnap.id, ...docSnap.data() }));

  renderAtendimentos();
}

function renderAtendimentos() {
  const div = document.getElementById("listaAtendimentos");
  if (!div) return;

  if (atendimentos.length === 0) {
    div.innerHTML = "<p>Nenhum atendimento cadastrado.</p>";
    return;
  }

  div.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Hora</th>
          <th>Cliente</th>
          <th>Serviço(s)</th>
          <th>Forma</th>
          <th>Total Cliente</th>
          <th>Líquido</th>
          <th>Materiais</th>
          <th>Lucro Real</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${atendimentos.map(a => `
          <tr>
            <td>${escapar(a.data)}</td>
            <td>${escapar(a.hora)}</td>
            <td>${escapar(a.clienteNome)}</td>
            <td>${escapar(a.servicoNome)}</td>
            <td>${escapar(a.formaPagamento)}</td>
            <td>${dinheiro(a.totalCliente || a.valorBase)}</td>
            <td>${dinheiro(a.valorLiquido || a.valorBase)}</td>
            <td>${dinheiro(a.custoMateriais || 0)}</td>
            <td>${dinheiro(a.lucroReal ?? a.valorLiquido ?? a.valorBase)}</td>
            <td>${badgeStatus(a.status)}</td>
            <td class="acoes">${acoesAtendimento(a)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function acoesAtendimento(a) {
  if (a.status === "Concluído") {
    return `
      <button class="btn-acao btn-editar" onclick="editarAtendimento('${a.id}')">Editar</button>
      <button class="btn-acao btn-alerta" onclick="reabrirAtendimento('${a.id}')">Reabrir</button>
      <button class="btn-acao btn-excluir" onclick="excluirAtendimento('${a.id}')">Excluir</button>
    `;
  }

  if (a.status === "Cancelado") {
    return `
      <button class="btn-acao btn-editar" onclick="editarAtendimento('${a.id}')">Editar</button>
      <button class="btn-acao btn-alerta" onclick="reabrirAtendimento('${a.id}')">Reabrir</button>
      <button class="btn-acao btn-excluir" onclick="excluirAtendimento('${a.id}')">Excluir</button>
    `;
  }

  return `
    <button class="btn-acao btn-editar" onclick="editarAtendimento('${a.id}')">Editar</button>
    <button class="btn-acao btn-concluir" onclick="concluirAtendimento('${a.id}')">Concluir</button>
    <button class="btn-acao btn-cancelar" onclick="cancelarAtendimento('${a.id}')">Cancelar</button>
    <button class="btn-acao btn-excluir" onclick="excluirAtendimento('${a.id}')">Excluir</button>
  `;
}

window.editarAtendimento = function(id) {
  const a = atendimentos.find(item => item.id === id);
  if (!a) return;

  atendimentoEditandoId = id;

  document.getElementById("agendaCliente").value = a.clienteId || "";
  document.getElementById("agendaData").value = a.data || dataHoje();
  document.getElementById("agendaHora").value = a.hora || "";
  document.getElementById("agendaPagamento").value = a.formaPagamento || "PIX";
  document.getElementById("agendaStatus").value = a.status || "Agendado";
  document.getElementById("agendaDescontoManual").value = numero(a.descontoManual);

  limparTabelaServicosAtendimento();
  limparTabelaMateriaisAtendimento();

  if (Array.isArray(a.itens) && a.itens.length) {
    a.itens.forEach(item => adicionarLinhaServicoAtendimento(item, false));
  } else {
    adicionarLinhaServicoAtendimento({
      servicoId: a.servicoId || "",
      preco: numero(a.valorBase),
      desconto: 0
    }, false);
  }

  if (Array.isArray(a.materiais)) {
    a.materiais.forEach(item => adicionarLinhaMaterialAtendimento(item, false));
  }

  const btn = document.getElementById("btnSalvarAtendimento");
  if (btn) btn.textContent = "Atualizar Atendimento";

  atualizarSimulacaoAgenda();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.excluirAtendimento = async function(id) {
  const a = atendimentos.find(item => item.id === id);
  if (!a) return;

  if (!confirm("Deseja excluir este atendimento?")) return;

  if (a.estoqueBaixado) await devolverEstoqueMateriais(a);
  if (a.financeiroId) await deleteDoc(doc(db, "financeiro", a.financeiroId));

  await deleteDoc(doc(db, "atendimentos", id));

  alert("Atendimento excluído com sucesso!");

  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarAtendimentos();
  await carregarFinanceiro();
  atualizarDashboard();
};

window.concluirAtendimento = async function(id) {
  if (!confirm("Deseja concluir este atendimento, baixar estoque e lançar no financeiro?")) return;
  await concluirAtendimentoInterno(id, true);
};

async function concluirAtendimentoInterno(id, mostrarMensagem) {
  let a = atendimentos.find(item => item.id === id);

  if (!a) {
    await carregarAtendimentos();
    a = atendimentos.find(item => item.id === id);
  }

  if (!a) {
    alert("Atendimento não encontrado.");
    return;
  }

  if (a.status === "Concluído" && a.financeiroId) {
    if (mostrarMensagem) alert("Este atendimento já está concluído.");
    return;
  }

  if (!a.estoqueBaixado) {
    await baixarEstoqueMateriais(a);
  }

  const atualizado = {
    ...a,
    id,
    status: "Concluído",
    estoqueBaixado: true
  };

  let financeiroId = a.financeiroId || "";

  if (!financeiroId) {
    financeiroId = await registrarEntradaDoAtendimento(atualizado, id);
  } else {
    await sincronizarFinanceiroDoAtendimento(id, atualizado);
  }

  await updateDoc(doc(db, "atendimentos", id), {
    status: "Concluído",
    financeiroId,
    estoqueBaixado: true,
    atualizadoEm: serverTimestamp()
  });

  if (mostrarMensagem) alert("Atendimento concluído, estoque baixado e financeiro lançado!");

  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarAtendimentos();
  await carregarFinanceiro();
  atualizarDashboard();
}

window.cancelarAtendimento = async function(id) {
  const a = atendimentos.find(item => item.id === id);
  if (!a) return;

  if (!confirm("Deseja cancelar este atendimento?")) return;

  if (a.estoqueBaixado) await devolverEstoqueMateriais(a);
  if (a.financeiroId) await deleteDoc(doc(db, "financeiro", a.financeiroId));

  await updateDoc(doc(db, "atendimentos", id), {
    status: "Cancelado",
    financeiroId: "",
    estoqueBaixado: false,
    atualizadoEm: serverTimestamp()
  });

  alert("Atendimento cancelado com sucesso!");

  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarAtendimentos();
  await carregarFinanceiro();
  atualizarDashboard();
};

window.reabrirAtendimento = async function(id) {
  const a = atendimentos.find(item => item.id === id);
  if (!a) return;

  if (!confirm("Deseja reabrir este atendimento? O estoque será devolvido e o financeiro removido.")) return;

  if (a.estoqueBaixado) await devolverEstoqueMateriais(a);
  if (a.financeiroId) await deleteDoc(doc(db, "financeiro", a.financeiroId));

  await updateDoc(doc(db, "atendimentos", id), {
    status: "Agendado",
    financeiroId: "",
    estoqueBaixado: false,
    atualizadoEm: serverTimestamp()
  });

  alert("Atendimento reaberto com sucesso!");

  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarAtendimentos();
  await carregarFinanceiro();
  atualizarDashboard();
};

async function baixarEstoqueMateriais(atendimento) {
  if (!Array.isArray(atendimento.materiais)) return;

  for (const item of atendimento.materiais) {
    const produto = produtos.find(p => p.id === item.produtoId);
    if (!produto) continue;

    const estoqueAnterior = numero(produto.quantidade);
    const estoqueNovo = arredondar(estoqueAnterior - numero(item.quantidade));

    await updateDoc(doc(db, "produtos", produto.id), {
      quantidade: estoqueNovo,
      atualizadoEm: serverTimestamp()
    });

    produto.quantidade = estoqueNovo;

    await registrarMovimentacaoEstoque({
      tipo: "Saída",
      data: atendimento.data || dataHoje(),
      produtoId: produto.id,
      produtoNome: produto.nome,
      quantidade: numero(item.quantidade),
      unidade: produto.unidade || item.unidade || "",
      estoqueAnterior: arredondar(estoqueAnterior),
      estoqueNovo,
      custoUnitario: numero(item.custoUnitario),
      custoTotal: numero(item.custoTotal),
      origem: "Atendimento",
      atendimentoId: atendimento.id || "",
      observacao: `Material usado em atendimento - ${atendimento.clienteNome || ""}`
    });
  }
}

async function devolverEstoqueMateriais(atendimento) {
  if (!Array.isArray(atendimento.materiais)) return;

  for (const item of atendimento.materiais) {
    const produto = produtos.find(p => p.id === item.produtoId);
    if (!produto) continue;

    const estoqueAnterior = numero(produto.quantidade);
    const estoqueNovo = arredondar(estoqueAnterior + numero(item.quantidade));

    await updateDoc(doc(db, "produtos", produto.id), {
      quantidade: estoqueNovo,
      atualizadoEm: serverTimestamp()
    });

    produto.quantidade = estoqueNovo;

    await registrarMovimentacaoEstoque({
      tipo: "Entrada",
      data: dataHoje(),
      produtoId: produto.id,
      produtoNome: produto.nome,
      quantidade: numero(item.quantidade),
      unidade: produto.unidade || item.unidade || "",
      estoqueAnterior: arredondar(estoqueAnterior),
      estoqueNovo,
      custoUnitario: numero(item.custoUnitario),
      custoTotal: numero(item.custoTotal),
      origem: "Devolução de Atendimento",
      atendimentoId: atendimento.id || "",
      observacao: `Estoque devolvido ao reabrir/cancelar/excluir atendimento - ${atendimento.clienteNome || ""}`
    });
  }
}

async function registrarEntradaDoAtendimento(atendimento, atendimentoId) {
  const entrada = {
    tipo: "Entrada",
    data: atendimento.data,
    categoria: "Atendimento",
    descricao: `Atendimento - ${atendimento.servicoNome}`,
    cliente: atendimento.clienteNome,
    formaPagamento: atendimento.formaPagamento,
    valor: numero(atendimento.totalCliente || atendimento.valorBase),
    valorLiquido: numero(atendimento.valorLiquido || atendimento.totalCliente || atendimento.valorBase),
    custoMateriais: numero(atendimento.custoMateriais),
    valorLucroReal: numero(atendimento.lucroReal ?? atendimento.valorLiquido),
    status: "Recebido",
    origem: "Atendimento",
    atendimentoId,
    criadoEm: serverTimestamp()
  };

  const ref = await addDoc(collection(db, "financeiro"), entrada);
  return ref.id;
}

async function sincronizarFinanceiroDoAtendimento(atendimentoId, atendimento) {
  if (!atendimento.financeiroId) return;

  await updateDoc(doc(db, "financeiro", atendimento.financeiroId), {
    data: atendimento.data,
    descricao: `Atendimento - ${atendimento.servicoNome}`,
    cliente: atendimento.clienteNome,
    formaPagamento: atendimento.formaPagamento,
    valor: numero(atendimento.totalCliente || atendimento.valorBase),
    valorLiquido: numero(atendimento.valorLiquido || atendimento.totalCliente || atendimento.valorBase),
    custoMateriais: numero(atendimento.custoMateriais),
    valorLucroReal: numero(atendimento.lucroReal ?? atendimento.valorLiquido),
    status: "Recebido",
    origem: "Atendimento",
    atendimentoId,
    atualizadoEm: serverTimestamp()
  });
}

/* FINANCEIRO */

async function salvarFinanceiro() {
  const item = {
    tipo: document.getElementById("finTipo").value,
    data: document.getElementById("finData").value,
    categoria: document.getElementById("finCategoria").value.trim(),
    descricao: document.getElementById("finDescricao").value.trim(),
    cliente: document.getElementById("finCliente").value.trim(),
    formaPagamento: document.getElementById("finPagamento").value,
    valor: numero(document.getElementById("finValor").value),
    valorLiquido: numero(document.getElementById("finValor").value),
    status: document.getElementById("finStatus").value,
    origem: "Manual",
    atualizadoEm: serverTimestamp()
  };

  if (!item.descricao) {
    alert("Informe a descrição.");
    return;
  }

  if (item.valor <= 0) {
    alert("Informe o valor.");
    return;
  }

  if (financeiroEditandoId) {
    const registro = financeiro.find(f => f.id === financeiroEditandoId);

    if (registro?.origem === "Atendimento") {
      alert("Lançamentos automáticos devem ser editados pela Agenda.");
      return;
    }

    await updateDoc(doc(db, "financeiro", financeiroEditandoId), item);
    alert("Lançamento atualizado com sucesso!");
  } else {
    item.criadoEm = serverTimestamp();
    await addDoc(collection(db, "financeiro"), item);
    alert("Lançamento salvo com sucesso!");
  }

  limparFinanceiro();
  await carregarFinanceiro();
  atualizarDashboard();
}

window.limparFinanceiro = function() {
  financeiroEditandoId = null;

  document.getElementById("finTipo").value = "Entrada";
  document.getElementById("finCategoria").value = "";
  document.getElementById("finDescricao").value = "";
  document.getElementById("finCliente").value = "";
  document.getElementById("finPagamento").value = "PIX";
  document.getElementById("finValor").value = 0;
  document.getElementById("finStatus").value = "Pendente";

  const btn = document.getElementById("btnSalvarFinanceiro");
  if (btn) btn.textContent = "Salvar Lançamento";

  definirDataHoje();
};

async function carregarFinanceiro() {
  const snap = await getDocs(query(collection(db, "financeiro"), orderBy("data", "desc")));
  financeiro = [];

  snap.forEach(docSnap => financeiro.push({ id: docSnap.id, ...docSnap.data() }));

  renderFinanceiro();
  atualizarDashboard();
}

function renderFinanceiro() {
  const div = document.getElementById("listaFinanceiro");
  if (!div) return;

  if (financeiro.length === 0) {
    div.innerHTML = "<p>Nenhum lançamento financeiro cadastrado.</p>";
    return;
  }

  div.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Categoria</th>
          <th>Descrição</th>
          <th>Cliente/Fornecedor</th>
          <th>Forma</th>
          <th>Valor</th>
          <th>Líquido</th>
          <th>Materiais</th>
          <th>Lucro Real</th>
          <th>Status</th>
          <th>Origem</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${financeiro.map(f => `
          <tr>
            <td>${escapar(f.data)}</td>
            <td>${badgeTipo(f.tipo)}</td>
            <td>${escapar(f.categoria)}</td>
            <td>${escapar(f.descricao)}</td>
            <td>${escapar(f.cliente)}</td>
            <td>${escapar(f.formaPagamento)}</td>
            <td>${dinheiro(f.valor)}</td>
            <td>${dinheiro(f.valorLiquido || f.valor)}</td>
            <td>${dinheiro(f.custoMateriais || 0)}</td>
            <td>${f.tipo === "Saída" ? "-" : dinheiro(f.valorLucroReal ?? f.valorLiquido ?? f.valor)}</td>
            <td>${badgeStatus(f.status)}</td>
            <td>${escapar(f.origem)}</td>
            <td class="acoes">${acoesFinanceiro(f)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function acoesFinanceiro(f) {
  if (f.origem === "Atendimento") {
    return `
      <button class="btn-acao btn-editar" onclick="verAtendimentoVinculado('${f.atendimentoId || ""}')">Ver Atendimento</button>
      <button class="btn-acao btn-excluir" onclick="excluirFinanceiro('${f.id}')">Excluir</button>
    `;
  }

  if (f.tipo === "Entrada") {
    return `
      <button class="btn-acao btn-editar" onclick="editarFinanceiro('${f.id}')">Editar</button>
      <button class="btn-acao btn-concluir" onclick="marcarFinanceiroRecebido('${f.id}')">Recebido</button>
      <button class="btn-acao btn-excluir" onclick="excluirFinanceiro('${f.id}')">Excluir</button>
    `;
  }

  return `
    <button class="btn-acao btn-editar" onclick="editarFinanceiro('${f.id}')">Editar</button>
    <button class="btn-acao btn-concluir" onclick="marcarFinanceiroPago('${f.id}')">Pago</button>
    <button class="btn-acao btn-excluir" onclick="excluirFinanceiro('${f.id}')">Excluir</button>
  `;
}

window.editarFinanceiro = function(id) {
  const f = financeiro.find(item => item.id === id);
  if (!f) return;

  if (f.origem === "Atendimento") {
    alert("Lançamentos automáticos devem ser editados pela Agenda.");
    return;
  }

  financeiroEditandoId = id;

  document.getElementById("finTipo").value = f.tipo || "Entrada";
  document.getElementById("finData").value = f.data || dataHoje();
  document.getElementById("finCategoria").value = f.categoria || "";
  document.getElementById("finDescricao").value = f.descricao || "";
  document.getElementById("finCliente").value = f.cliente || "";
  document.getElementById("finPagamento").value = f.formaPagamento || "PIX";
  document.getElementById("finValor").value = numero(f.valor);
  document.getElementById("finStatus").value = f.status || "Pendente";

  const btn = document.getElementById("btnSalvarFinanceiro");
  if (btn) btn.textContent = "Atualizar Lançamento";

  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.marcarFinanceiroRecebido = async function(id) {
  await updateDoc(doc(db, "financeiro", id), {
    status: "Recebido",
    atualizadoEm: serverTimestamp()
  });

  await carregarFinanceiro();
  atualizarDashboard();
};

window.marcarFinanceiroPago = async function(id) {
  await updateDoc(doc(db, "financeiro", id), {
    status: "Pago",
    atualizadoEm: serverTimestamp()
  });

  await carregarFinanceiro();
  atualizarDashboard();
};

window.excluirFinanceiro = async function(id) {
  const f = financeiro.find(item => item.id === id);
  if (!f) return;

  if (!confirm("Deseja excluir este lançamento financeiro?")) return;

  if (f.origem === "Atendimento" && f.atendimentoId) {
    const a = atendimentos.find(item => item.id === f.atendimentoId);

    if (a?.estoqueBaixado) await devolverEstoqueMateriais(a);

    await updateDoc(doc(db, "atendimentos", f.atendimentoId), {
      status: "Agendado",
      financeiroId: "",
      estoqueBaixado: false,
      atualizadoEm: serverTimestamp()
    });
  }

  await deleteDoc(doc(db, "financeiro", id));

  await carregarProdutos();
  await carregarMovimentacoesEstoque();
  await carregarAtendimentos();
  await carregarFinanceiro();
  atualizarDashboard();
};

window.verAtendimentoVinculado = async function(atendimentoId) {
  if (!atendimentoId) {
    alert("Este lançamento não possui atendimento vinculado.");
    return;
  }

  await window.mostrarTela("agenda");

  if (!atendimentos.find(a => a.id === atendimentoId)) {
    alert("Atendimento vinculado não encontrado.");
    return;
  }

  editarAtendimento(atendimentoId);
};
