const { LOGO_DOMINIUM } = require('./dominiumLogoBase64');
const { PLAYFAIR_REGULAR, PLAYFAIR_SEMIBOLD } = require('./relatorioFontesBase64');

// Porte 1:1 do frontend/src/lib/relatorioPdf.tsx pro backend, pra gerar o PDF
// no servidor e entrega-lo por URL direta (Content-Disposition: inline) —
// ver rota GET /api/relatorio/pdf. Sem JSX aqui (backend e' CommonJS puro),
// entao os elementos sao montados com React.createElement.

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMesLabel(chave) {
  const [ano, mes] = chave.split('-');
  const nomes = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  return `${nomes[parseInt(mes, 10) - 1]} de ${ano}`;
}

function construirDescritorPeriodo(inicioJanela, fimJanela) {
  if (inicioJanela === fimJanela) return `Referência: ${formatarMesLabel(inicioJanela)}`;
  return `Referência: de ${formatarMesLabel(inicioJanela)} a ${formatarMesLabel(fimJanela)}`;
}

function agruparSecoes(porInstancia) {
  const receitas = porInstancia.filter((i) => i.instancia.grupo === 'receita');
  const despesas = porInstancia.filter((i) => i.instancia.grupo === 'gasto');
  const reservaPessoal = porInstancia.filter(
    (i) => i.instancia.grupo === 'investimento' && i.instancia.subgrupo === 'pessoal'
  );
  const reservaPatrimonial = porInstancia.filter(
    (i) => i.instancia.grupo === 'investimento' && i.instancia.subgrupo !== 'pessoal'
  );
  return [
    { titulo: 'Receitas', itens: receitas },
    { titulo: 'Despesas', itens: despesas },
    { titulo: 'Reserva Pessoal', itens: reservaPessoal },
    { titulo: 'Reserva Patrimonial / Investimentos', itens: reservaPatrimonial },
  ].filter((secao) => secao.itens.length > 0);
}

// Paleta de marca do PDF — só usada aqui.
const NAVY_DEEP = '#061221';
const NAVY = '#0A1A2F';
const GOLD = '#C9A24B';
const GOLD_DARK = '#D19743';
const CREAM = '#F3F0EA';
const INK = '#1A2632';
const MUTE = '#6B7785';
const LINE = '#E5E2DA';
const NEGATIVE = '#C0473B';
const CARD_BG = '#FBFAF7';

async function gerarRelatorioPdfBuffer(dados) {
  const { createElement: h } = require('react');
  const { Document, Page, Text, View, Image, StyleSheet, Font, pdf } = await import('@react-pdf/renderer');

  let fontSerifada = 'Playfair';
  try {
    Font.register({
      family: 'Playfair',
      fonts: [
        { src: PLAYFAIR_REGULAR },
        { src: PLAYFAIR_SEMIBOLD, fontWeight: 600 },
      ],
    });
    Font.registerHyphenationCallback((palavra) => [palavra]);
  } catch (err) {
    console.error('Falha ao registrar Playfair Display; usando Times-Roman como fallback.', err);
    fontSerifada = 'Times-Roman';
  }

  const { resumo, porInstancia } = dados;
  const secoes = agruparSecoes(porInstancia);
  const mostrarProjecao = resumo.janela !== 'mes';
  const descritorPeriodo = construirDescritorPeriodo(resumo.inicioJanela, resumo.fimJanela);

  const resumoItens = [
    { label: 'Receita no período', valor: formatarMoeda(resumo.receitaPeriodo), negativo: false },
    { label: 'Despesa no período', valor: formatarMoeda(resumo.despesaPeriodo), negativo: false },
    { label: 'Saldo no período', valor: formatarMoeda(resumo.saldoPeriodo), negativo: resumo.saldoPeriodo < 0 },
    { label: 'Sobra do mês', valor: formatarMoeda(resumo.sobraLivreMes), negativo: resumo.sobraLivreMes < 0 },
    {
      label: 'Comprometimento',
      valor: `${resumo.comprometimento.toFixed(0)}%`,
      negativo: resumo.comprometimento > 100,
    },
    { label: 'Patrimônio investido', valor: formatarMoeda(resumo.patrimonioInvestido), negativo: false },
    { label: 'Reserva Pessoal', valor: formatarMoeda(resumo.patrimonioPessoal), negativo: false },
    { label: 'Reserva Patrimonial', valor: formatarMoeda(resumo.patrimonioPatrimonial), negativo: false },
  ];
  if (mostrarProjecao) {
    resumoItens.push(
      { label: 'Projeção Reserva Pessoal', valor: formatarMoeda(resumo.projecaoPatrimonioPessoal), negativo: false },
      {
        label: 'Projeção Reserva Patrimonial',
        valor: formatarMoeda(resumo.projecaoPatrimonioPatrimonial),
        negativo: false,
      }
    );
  }

  function montarDocumento(fontTitulo) {
    const styles = StyleSheet.create({
      page: { fontFamily: 'Helvetica', fontSize: 9, color: INK },
      hero: {
        backgroundColor: NAVY_DEEP,
        paddingHorizontal: 34,
        paddingVertical: 30,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
      heroTextoBloco: { flexShrink: 1, paddingRight: 16 },
      kicker: { fontSize: 8, letterSpacing: 3, color: GOLD, marginBottom: 6 },
      heroTitulo: { fontFamily: fontTitulo, fontWeight: 600, fontSize: 25, color: CREAM },
      regua: { width: 54, height: 2, backgroundColor: GOLD, marginTop: 8, marginBottom: 8 },
      heroSubtitulo: { fontFamily: 'Helvetica', fontStyle: 'italic', fontSize: 10, color: '#B9C4D1' },
      medalhao: {
        width: 74,
        height: 74,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      },
      logoImg: { width: 74, height: 74, objectFit: 'contain' },
      corpo: { paddingHorizontal: 34, paddingTop: 24, paddingBottom: 60 },
      secaoTitulo: {
        fontFamily: 'Helvetica',
        fontSize: 8,
        letterSpacing: 2.5,
        color: GOLD_DARK,
        borderBottomWidth: 1,
        borderBottomColor: LINE,
        paddingBottom: 5,
        marginBottom: 10,
      },
      secaoTituloGrupo: { marginTop: 26 },
      resumoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
      resumoCard: {
        width: '32%',
        backgroundColor: CARD_BG,
        borderWidth: 1,
        borderColor: LINE,
        borderLeftWidth: 3,
        borderLeftColor: GOLD,
        borderRadius: 3,
        padding: 10,
        marginBottom: 9,
      },
      resumoLabel: { fontFamily: 'Helvetica', fontSize: 7, color: MUTE, letterSpacing: 0.6, marginBottom: 3 },
      resumoValor: { fontFamily: fontTitulo, fontSize: 15, color: NAVY },
      resumoValorNegativo: { color: NEGATIVE },
      tabelaHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1.5,
        borderBottomColor: NAVY,
        paddingBottom: 4,
        marginBottom: 2,
      },
      tabelaHeaderTexto: { fontFamily: 'Helvetica', fontSize: 7, letterSpacing: 1, color: MUTE },
      tabelaLinha: {
        flexDirection: 'row',
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: '#EFECE5',
      },
      linhaSubtotal: {
        flexDirection: 'row',
        paddingVertical: 5,
        borderBottomWidth: 1.5,
        borderBottomColor: LINE,
      },
      colInstancia: { width: '26%', fontFamily: 'Helvetica-Bold', fontSize: 9, color: NAVY },
      colDescricao: { width: '30%', fontSize: 9, color: INK },
      colCompetencia: { width: '20%', fontSize: 9, color: MUTE, textAlign: 'center' },
      colParcela: { width: '12%', fontSize: 9, color: MUTE, textAlign: 'center' },
      colValor: { width: '12%', fontSize: 9, color: INK, textAlign: 'right' },
      headerInstancia: { width: '26%' },
      headerDescricao: { width: '30%' },
      headerCompetencia: { width: '20%', textAlign: 'center' },
      headerParcela: { width: '12%', textAlign: 'center' },
      headerValor: { width: '12%', textAlign: 'right' },
      subtotalLabel: { width: '76%', fontFamily: 'Helvetica-Bold', fontSize: 8, color: GOLD_DARK },
      subtotalValor: { width: '12%', fontFamily: 'Helvetica-Bold', fontSize: 9, color: NAVY, textAlign: 'right' },
      rodape: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'flex-start',
        borderTopWidth: 1,
        borderTopColor: LINE,
        paddingHorizontal: 44,
        paddingVertical: 10,
      },
      rodapeTexto: { fontFamily: 'Helvetica', fontSize: 7, color: MUTE },
    });

    function blocoInstancia(item) {
      const subtotal = item.linhas.reduce((acc, l) => acc + l.valor, 0);
      return [
        ...item.linhas.map((linha, idx) =>
          h(
            View,
            { key: `${linha.lancamentoId}-${linha.mes}`, style: styles.tabelaLinha },
            h(Text, { style: styles.colInstancia }, idx === 0 ? item.instancia.nome : ''),
            h(Text, { style: styles.colDescricao }, linha.descricao),
            h(Text, { style: styles.colCompetencia }, formatarMesLabel(linha.mes)),
            h(Text, { style: styles.colParcela }, linha.parcela ? `${linha.parcela}/${linha.totalParcelas}` : '—'),
            h(Text, { style: styles.colValor }, formatarMoeda(linha.valor))
          )
        ),
        h(
          View,
          { key: 'subtotal', style: styles.linhaSubtotal },
          h(Text, { style: styles.subtotalLabel }, 'Subtotal'),
          h(Text, { style: styles.subtotalValor }, formatarMoeda(subtotal))
        ),
      ];
    }

    function cabecalhoTabela() {
      return h(
        View,
        { style: styles.tabelaHeader },
        h(Text, { style: [styles.tabelaHeaderTexto, styles.headerInstancia] }, 'INSTÂNCIA'),
        h(Text, { style: [styles.tabelaHeaderTexto, styles.headerDescricao] }, 'DESCRIÇÃO'),
        h(Text, { style: [styles.tabelaHeaderTexto, styles.headerCompetencia] }, 'COMPETÊNCIA'),
        h(Text, { style: [styles.tabelaHeaderTexto, styles.headerParcela] }, 'PARCELA'),
        h(Text, { style: [styles.tabelaHeaderTexto, styles.headerValor] }, 'VALOR')
      );
    }

    return h(
      Document,
      null,
      h(
        Page,
        { size: 'A4', style: styles.page },
        h(
          View,
          { style: styles.hero },
          h(
            View,
            { style: styles.heroTextoBloco },
            h(Text, { style: styles.kicker }, 'RELATÓRIO DO PERÍODO'),
            h(Text, { style: styles.heroTitulo }, 'Demonstrativo Financeiro'),
            h(View, { style: styles.regua }),
            h(Text, { style: styles.heroSubtitulo }, descritorPeriodo)
          ),
          h(View, { style: styles.medalhao }, h(Image, { src: LOGO_DOMINIUM, style: styles.logoImg }))
        ),
        h(
          View,
          { style: styles.corpo },
          h(Text, { style: styles.secaoTitulo }, 'RESUMO GERAL'),
          h(
            View,
            { style: styles.resumoGrid },
            resumoItens.map((item) =>
              h(
                View,
                { key: item.label, style: styles.resumoCard },
                h(Text, { style: styles.resumoLabel }, item.label.toUpperCase()),
                h(
                  Text,
                  { style: item.negativo ? [styles.resumoValor, styles.resumoValorNegativo] : styles.resumoValor },
                  item.valor
                )
              )
            )
          ),
          ...secoes.map((secao) => {
            const [primeiraInstancia, ...demaisInstancias] = secao.itens;
            return h(
              View,
              { key: secao.titulo },
              h(
                View,
                { wrap: false },
                h(Text, { style: [styles.secaoTitulo, styles.secaoTituloGrupo] }, secao.titulo.toUpperCase()),
                cabecalhoTabela(),
                ...blocoInstancia(primeiraInstancia)
              ),
              ...demaisInstancias.map((item) => h(View, { key: item.instancia.id, wrap: false }, ...blocoInstancia(item)))
            );
          })
        ),
        h(
          View,
          { style: styles.rodape, fixed: true },
          h(
            Text,
            { style: styles.rodapeTexto },
            'Gerado por ',
            h(Text, { style: { color: GOLD_DARK } }, 'dominiumfinance.com.br'),
            ` em ${new Date().toLocaleString('pt-BR')}`
          )
        )
      )
    );
  }

  try {
    const stream = await pdf(montarDocumento(fontSerifada)).toBuffer();
    return stream;
  } catch (err) {
    if (fontSerifada === 'Times-Roman') throw err;
    console.error('Falha ao renderizar PDF com Playfair Display; usando Times-Roman como fallback.', err);
    return await pdf(montarDocumento('Times-Roman')).toBuffer();
  }
}

module.exports = { gerarRelatorioPdfBuffer };
