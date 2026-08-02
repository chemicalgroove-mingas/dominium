import { formatarMoeda } from "@/lib/format";
import { formatarMesLabel } from "@/lib/mes";
import type { InstanciaRelatorio, Janela, RelatorioData } from "@/lib/types";

const LABEL_JANELA: Record<Janela, string> = {
  mes: "1 mês",
  "3m": "3 meses",
  "6m": "6 meses",
  "12m": "12 meses",
};

function agruparSecoes(porInstancia: InstanciaRelatorio[]) {
  const receitas = porInstancia.filter((i) => i.instancia.grupo === "receita");
  const despesas = porInstancia.filter((i) => i.instancia.grupo === "gasto");
  const reservaPessoal = porInstancia.filter(
    (i) => i.instancia.grupo === "investimento" && i.instancia.subgrupo === "pessoal"
  );
  const reservaPatrimonial = porInstancia.filter(
    (i) => i.instancia.grupo === "investimento" && i.instancia.subgrupo !== "pessoal"
  );
  return [
    { titulo: "Receitas", itens: receitas },
    { titulo: "Despesas", itens: despesas },
    { titulo: "Reserva Pessoal", itens: reservaPessoal },
    { titulo: "Reserva Patrimonial / Investimentos", itens: reservaPatrimonial },
  ].filter((secao) => secao.itens.length > 0);
}

// So importa @react-pdf/renderer quando o usuario efetivamente pede o PDF —
// mantem a lib fora do bundle inicial do PWA. O frontend aqui so formata o
// JSON que o backend ja calculou (GET /api/relatorio); nenhuma projecao ou
// competencia e recalculada.
export async function gerarRelatorioPdfBlob(dados: RelatorioData): Promise<Blob> {
  const { Document, Page, Text, View, StyleSheet, Font, pdf } = await import("@react-pdf/renderer");
  void Font;

  const styles = StyleSheet.create({
    page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1A2A3D" },
    titulo: { fontSize: 16, marginBottom: 2, fontFamily: "Helvetica-Bold" },
    subtitulo: { fontSize: 10, color: "#5B6B7D", marginBottom: 16 },
    secaoTitulo: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
    resumoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    resumoCard: { width: "31%", borderWidth: 1, borderColor: "#D8DEE6", borderRadius: 4, padding: 8, marginBottom: 8 },
    resumoLabel: { fontSize: 8, color: "#5B6B7D", marginBottom: 2 },
    resumoValor: { fontSize: 12, fontFamily: "Helvetica-Bold" },
    tabelaHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1A2A3D", paddingBottom: 3, marginBottom: 3 },
    tabelaLinha: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#D8DEE6", paddingVertical: 2 },
    colInstancia: { width: "28%", fontFamily: "Helvetica-Bold" },
    colDescricao: { width: "34%" },
    colMes: { width: "16%" },
    colParcela: { width: "10%" },
    colValor: { width: "12%", textAlign: "right" },
    instanciaSubtotal: { fontFamily: "Helvetica-Bold" },
    rodape: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 8, color: "#8496AC", textAlign: "center" },
  });

  const { resumo, porInstancia } = dados;
  const secoes = agruparSecoes(porInstancia);
  const mostrarProjecao = resumo.janela !== "mes";

  const resumoItens: { label: string; valor: string }[] = [
    { label: "Receita no período", valor: formatarMoeda(resumo.receitaPeriodo) },
    { label: "Despesa no período", valor: formatarMoeda(resumo.despesaPeriodo) },
    { label: "Saldo no período", valor: formatarMoeda(resumo.saldoPeriodo) },
    { label: "Sobra do mês", valor: formatarMoeda(resumo.sobraLivreMes) },
    { label: "Comprometimento", valor: `${resumo.comprometimento.toFixed(0)}%` },
    { label: "Patrimônio investido", valor: formatarMoeda(resumo.patrimonioInvestido) },
    { label: "Reserva Pessoal", valor: formatarMoeda(resumo.patrimonioPessoal) },
    { label: "Reserva Patrimonial", valor: formatarMoeda(resumo.patrimonioPatrimonial) },
  ];
  if (mostrarProjecao) {
    resumoItens.push(
      { label: "Projeção Reserva Pessoal", valor: formatarMoeda(resumo.projecaoPatrimonioPessoal) },
      { label: "Projeção Reserva Patrimonial", valor: formatarMoeda(resumo.projecaoPatrimonioPatrimonial) }
    );
  }

  const documento = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titulo}>Relatório do Período — DOMINIUM</Text>
        <Text style={styles.subtitulo}>
          {LABEL_JANELA[resumo.janela]} a partir de {formatarMesLabel(resumo.mesReferencia)}
        </Text>

        <Text style={styles.secaoTitulo}>Resumo geral</Text>
        <View style={styles.resumoGrid}>
          {resumoItens.map((item) => (
            <View key={item.label} style={styles.resumoCard}>
              <Text style={styles.resumoLabel}>{item.label}</Text>
              <Text style={styles.resumoValor}>{item.valor}</Text>
            </View>
          ))}
        </View>

        {secoes.map((secao) => (
          <View key={secao.titulo} wrap={false}>
            <Text style={styles.secaoTitulo}>{secao.titulo}</Text>
            <View style={styles.tabelaHeader}>
              <Text style={styles.colInstancia}>Instância</Text>
              <Text style={styles.colDescricao}>Descrição</Text>
              <Text style={styles.colMes}>Competência</Text>
              <Text style={styles.colParcela}>Parcela</Text>
              <Text style={styles.colValor}>Valor</Text>
            </View>
            {secao.itens.map((item) => {
              const subtotal = item.linhas.reduce((acc, l) => acc + l.valor, 0);
              return (
                <View key={item.instancia.id}>
                  {item.linhas.map((linha, idx) => (
                    <View key={`${linha.lancamentoId}-${linha.mes}`} style={styles.tabelaLinha}>
                      <Text style={styles.colInstancia}>{idx === 0 ? item.instancia.nome : ""}</Text>
                      <Text style={styles.colDescricao}>{linha.descricao}</Text>
                      <Text style={styles.colMes}>{formatarMesLabel(linha.mes)}</Text>
                      <Text style={styles.colParcela}>
                        {linha.parcela ? `${linha.parcela}/${linha.totalParcelas}` : "—"}
                      </Text>
                      <Text style={styles.colValor}>{formatarMoeda(linha.valor)}</Text>
                    </View>
                  ))}
                  <View style={styles.tabelaLinha}>
                    <Text style={[styles.colInstancia, styles.instanciaSubtotal]}>Subtotal</Text>
                    <Text style={styles.colDescricao}></Text>
                    <Text style={styles.colMes}></Text>
                    <Text style={styles.colParcela}></Text>
                    <Text style={[styles.colValor, styles.instanciaSubtotal]}>{formatarMoeda(subtotal)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ))}

        <Text style={styles.rodape} fixed>
          Gerado pelo DOMINIUM em {new Date().toLocaleString("pt-BR")} — documento sob demanda, não armazenado.
        </Text>
      </Page>
    </Document>
  );

  return pdf(documento).toBlob();
}
