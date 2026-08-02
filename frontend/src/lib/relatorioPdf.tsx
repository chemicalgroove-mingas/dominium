import { formatarMoeda } from "@/lib/format";
import { formatarMesLabel } from "@/lib/mes";
import { LOGO_DOMINIUM } from "@/lib/dominiumLogoBase64";
import type { InstanciaRelatorio, RelatorioData } from "@/lib/types";

// Usa os limites REAIS do recorte, ja calculados pelo backend (resumo.inicioJanela/
// fimJanela — ver calcularResumo/limitesJanela), em vez de recalcular "pra frente"
// a partir de mesReferencia aqui. Critico pro relatorio "passado": mesReferencia
// e' o mes final nesse caso, entao qualquer formula fixa "mesReferencia + N-1"
// mostraria o intervalo errado. O backend e' a fonte de verdade da direcao.
function construirDescritorPeriodo(inicioJanela: string, fimJanela: string) {
  if (inicioJanela === fimJanela) return `Referência: ${formatarMesLabel(inicioJanela)}`;
  return `Referência: de ${formatarMesLabel(inicioJanela)} a ${formatarMesLabel(fimJanela)}`;
}

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

// Paleta de marca do PDF — só usada aqui, não é o design system da UI (que
// vive em globals.css/tailwind.config).
const NAVY_DEEP = "#061221";
const NAVY = "#0A1A2F";
const GOLD = "#C9A24B";
const GOLD_DARK = "#D19743";
const CREAM = "#F3F0EA";
const INK = "#1A2632";
const MUTE = "#6B7785";
const LINE = "#E5E2DA";
const NEGATIVE = "#C0473B";
const CARD_BG = "#FBFAF7";

// So importa @react-pdf/renderer quando o usuario efetivamente pede o PDF —
// mantem a lib fora do bundle inicial do PWA. O frontend aqui so formata o
// JSON que o backend ja calculou (GET /api/relatorio); nenhuma projecao ou
// competencia e recalculada.
export async function gerarRelatorioPdfBlob(dados: RelatorioData): Promise<Blob> {
  const { Document, Page, Text, View, Image, StyleSheet, Font, pdf } = await import("@react-pdf/renderer");

  // Tenta registrar a serifada da marca (Playfair Display, .ttf locais em
  // /public/fonts — nunca URL externa em runtime). Se falhar por qualquer
  // motivo (arquivo ausente no build, erro de parsing), cai para Times-Roman
  // (base14, sempre embutida) em vez de quebrar a geração do relatório.
  let fontSerifada = "Playfair";
  try {
    Font.register({
      family: "Playfair",
      fonts: [
        { src: "/fonts/PlayfairDisplay-Regular.ttf" },
        { src: "/fonts/PlayfairDisplay-SemiBold.ttf", fontWeight: 600 },
      ],
    });
    Font.registerHyphenationCallback((palavra) => [palavra]);
  } catch (err) {
    console.error("Falha ao registrar Playfair Display; usando Times-Roman como fallback.", err);
    fontSerifada = "Times-Roman";
  }

  const { resumo, porInstancia } = dados;
  const secoes = agruparSecoes(porInstancia);
  const mostrarProjecao = resumo.janela !== "mes";
  const descritorPeriodo = construirDescritorPeriodo(resumo.inicioJanela, resumo.fimJanela);

  type ItemResumo = { label: string; valor: string; negativo: boolean };
  const resumoItens: ItemResumo[] = [
    { label: "Receita no período", valor: formatarMoeda(resumo.receitaPeriodo), negativo: false },
    { label: "Despesa no período", valor: formatarMoeda(resumo.despesaPeriodo), negativo: false },
    { label: "Saldo no período", valor: formatarMoeda(resumo.saldoPeriodo), negativo: resumo.saldoPeriodo < 0 },
    { label: "Sobra do mês", valor: formatarMoeda(resumo.sobraLivreMes), negativo: resumo.sobraLivreMes < 0 },
    {
      label: "Comprometimento",
      valor: `${resumo.comprometimento.toFixed(0)}%`,
      negativo: resumo.comprometimento > 100,
    },
    { label: "Patrimônio investido", valor: formatarMoeda(resumo.patrimonioInvestido), negativo: false },
    { label: "Reserva Pessoal", valor: formatarMoeda(resumo.patrimonioPessoal), negativo: false },
    { label: "Reserva Patrimonial", valor: formatarMoeda(resumo.patrimonioPatrimonial), negativo: false },
  ];
  if (mostrarProjecao) {
    resumoItens.push(
      { label: "Projeção Reserva Pessoal", valor: formatarMoeda(resumo.projecaoPatrimonioPessoal), negativo: false },
      {
        label: "Projeção Reserva Patrimonial",
        valor: formatarMoeda(resumo.projecaoPatrimonioPatrimonial),
        negativo: false,
      }
    );
  }

  // Construtor do documento parametrizado pela fonte serifada — permite
  // remontar com Times-Roman se o Playfair falhar só na hora de renderizar
  // (fontes react-pdf são resolvidas de forma preguiçosa, dentro de toBlob).
  function montarDocumento(fontTitulo: string) {
    const styles = StyleSheet.create({
      page: { fontFamily: "Helvetica", fontSize: 9, color: INK },
      hero: {
        backgroundColor: NAVY_DEEP,
        paddingHorizontal: 34,
        paddingVertical: 30,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      },
      heroTextoBloco: { flexShrink: 1, paddingRight: 16 },
      kicker: { fontSize: 8, letterSpacing: 3, color: GOLD, marginBottom: 6 },
      heroTitulo: { fontFamily: fontTitulo, fontWeight: 600, fontSize: 25, color: CREAM },
      regua: { width: 54, height: 2, backgroundColor: GOLD, marginTop: 8, marginBottom: 8 },
      heroSubtitulo: { fontFamily: "Helvetica", fontStyle: "italic", fontSize: 10, color: "#B9C4D1" },
      // A imagem-fonte (LOGO_DOMINIUM) ja e' um circulo pronto — fundo navy e
      // anel proprios, recortado com transparencia por fora. Nao aplicar
      // borderRadius/border aqui: isso criaria um segundo anel dourado por
      // cima do que a propria imagem ja tem.
      medalhao: {
        width: 74,
        height: 74,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      },
      logoImg: { width: 74, height: 74, objectFit: "contain" },
      corpo: { paddingHorizontal: 34, paddingTop: 24, paddingBottom: 60 },
      secaoTitulo: {
        fontFamily: "Helvetica",
        fontSize: 8,
        letterSpacing: 2.5,
        color: GOLD_DARK,
        borderBottomWidth: 1,
        borderBottomColor: LINE,
        paddingBottom: 5,
        marginBottom: 10,
      },
      secaoTituloGrupo: { marginTop: 26 },
      resumoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
      resumoCard: {
        width: "32%",
        backgroundColor: CARD_BG,
        borderWidth: 1,
        borderColor: LINE,
        borderLeftWidth: 3,
        borderLeftColor: GOLD,
        borderRadius: 3,
        padding: 10,
        marginBottom: 9,
      },
      resumoLabel: { fontFamily: "Helvetica", fontSize: 7, color: MUTE, letterSpacing: 0.6, marginBottom: 3 },
      resumoValor: { fontFamily: fontTitulo, fontSize: 15, color: NAVY },
      resumoValorNegativo: { color: NEGATIVE },
      tabelaHeader: {
        flexDirection: "row",
        borderBottomWidth: 1.5,
        borderBottomColor: NAVY,
        paddingBottom: 4,
        marginBottom: 2,
      },
      tabelaHeaderTexto: { fontFamily: "Helvetica", fontSize: 7, letterSpacing: 1, color: MUTE },
      tabelaLinha: {
        flexDirection: "row",
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: "#EFECE5",
      },
      linhaSubtotal: {
        flexDirection: "row",
        paddingVertical: 5,
        borderBottomWidth: 1.5,
        borderBottomColor: LINE,
      },
      colInstancia: { width: "26%", fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY },
      colDescricao: { width: "30%", fontSize: 9, color: INK },
      colCompetencia: { width: "20%", fontSize: 9, color: MUTE, textAlign: "center" },
      colParcela: { width: "12%", fontSize: 9, color: MUTE, textAlign: "center" },
      colValor: { width: "12%", fontSize: 9, color: INK, textAlign: "right" },
      headerInstancia: { width: "26%" },
      headerDescricao: { width: "30%" },
      headerCompetencia: { width: "20%", textAlign: "center" },
      headerParcela: { width: "12%", textAlign: "center" },
      headerValor: { width: "12%", textAlign: "right" },
      subtotalLabel: { width: "76%", fontFamily: "Helvetica-Bold", fontSize: 8, color: GOLD_DARK },
      subtotalValor: { width: "12%", fontFamily: "Helvetica-Bold", fontSize: 9, color: NAVY, textAlign: "right" },
      rodape: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "flex-start",
        borderTopWidth: 1,
        borderTopColor: LINE,
        paddingHorizontal: 44,
        paddingVertical: 10,
      },
      rodapeTexto: { fontFamily: "Helvetica", fontSize: 7, color: MUTE },
    });

    // Linhas + subtotal de uma instância — extraído pra ser reaproveitado
    // tanto "solto" (wrap independente) quanto colado ao cabeçalho da seção
    // (primeira instância, ver abaixo).
    function blocoInstancia(item: InstanciaRelatorio) {
      const subtotal = item.linhas.reduce((acc, l) => acc + l.valor, 0);
      return (
        <>
          {item.linhas.map((linha, idx) => (
            <View key={`${linha.lancamentoId}-${linha.mes}`} style={styles.tabelaLinha}>
              <Text style={styles.colInstancia}>{idx === 0 ? item.instancia.nome : ""}</Text>
              <Text style={styles.colDescricao}>{linha.descricao}</Text>
              <Text style={styles.colCompetencia}>{formatarMesLabel(linha.mes)}</Text>
              <Text style={styles.colParcela}>{linha.parcela ? `${linha.parcela}/${linha.totalParcelas}` : "—"}</Text>
              <Text style={styles.colValor}>{formatarMoeda(linha.valor)}</Text>
            </View>
          ))}
          <View style={styles.linhaSubtotal}>
            <Text style={styles.subtotalLabel}>Subtotal</Text>
            <Text style={styles.subtotalValor}>{formatarMoeda(subtotal)}</Text>
          </View>
        </>
      );
    }

    function cabecalhoTabela() {
      return (
        <View style={styles.tabelaHeader}>
          <Text style={[styles.tabelaHeaderTexto, styles.headerInstancia]}>INSTÂNCIA</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.headerDescricao]}>DESCRIÇÃO</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.headerCompetencia]}>COMPETÊNCIA</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.headerParcela]}>PARCELA</Text>
          <Text style={[styles.tabelaHeaderTexto, styles.headerValor]}>VALOR</Text>
        </View>
      );
    }

    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <View style={styles.hero}>
            <View style={styles.heroTextoBloco}>
              <Text style={styles.kicker}>RELATÓRIO DO PERÍODO</Text>
              <Text style={styles.heroTitulo}>Demonstrativo Financeiro</Text>
              <View style={styles.regua} />
              <Text style={styles.heroSubtitulo}>{descritorPeriodo}</Text>
            </View>
            <View style={styles.medalhao}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui e' do @react-pdf/renderer, nao HTML img */}
              <Image src={LOGO_DOMINIUM} style={styles.logoImg} />
            </View>
          </View>

          <View style={styles.corpo}>
            <Text style={styles.secaoTitulo}>RESUMO GERAL</Text>
            <View style={styles.resumoGrid}>
              {resumoItens.map((item) => (
                <View key={item.label} style={styles.resumoCard}>
                  <Text style={styles.resumoLabel}>{item.label.toUpperCase()}</Text>
                  <Text style={item.negativo ? [styles.resumoValor, styles.resumoValorNegativo] : styles.resumoValor}>
                    {item.valor}
                  </Text>
                </View>
              ))}
            </View>

            {secoes.map((secao) => {
              const [primeiraInstancia, ...demaisInstancias] = secao.itens;
              return (
                <View key={secao.titulo}>
                  {/* Título + cabeçalho da tabela nunca ficam sozinhos no fim de
                      uma página: colados aqui com a PRIMEIRA instância (linhas +
                      subtotal) num único bloco que não quebra. As instâncias
                      seguintes continuam quebrando independentemente, cada uma
                      com seu próprio wrap={false} (só pra não partir uma
                      instância ao meio entre suas linhas e o subtotal). */}
                  <View wrap={false}>
                    <Text style={[styles.secaoTitulo, styles.secaoTituloGrupo]}>{secao.titulo.toUpperCase()}</Text>
                    {cabecalhoTabela()}
                    {blocoInstancia(primeiraInstancia)}
                  </View>
                  {demaisInstancias.map((item) => (
                    <View key={item.instancia.id} wrap={false}>
                      {blocoInstancia(item)}
                    </View>
                  ))}
                </View>
              );
            })}
          </View>

          <View style={styles.rodape} fixed>
            <Text style={styles.rodapeTexto}>
              Gerado por <Text style={{ color: GOLD_DARK }}>dominiumfinance.com.br</Text> em{" "}
              {new Date().toLocaleString("pt-BR")}
            </Text>
          </View>
        </Page>
      </Document>
    );
  }

  try {
    return await pdf(montarDocumento(fontSerifada)).toBlob();
  } catch (err) {
    if (fontSerifada === "Times-Roman") throw err;
    console.error("Falha ao renderizar PDF com Playfair Display; usando Times-Roman como fallback.", err);
    return await pdf(montarDocumento("Times-Roman")).toBlob();
  }
}
