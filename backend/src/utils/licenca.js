// Regras de dominio da licenca — o eixo de estado que responde "esta conta
// pode ESCREVER agora?".
//
// A conta nunca vence. O que vence e o direito de gravar dados novos: licenca
// expirada mantem login, leitura, relatorio, PDF e exportacao, e bloqueia toda
// escrita. Isso e' deliberadamente independente de Usuario.status (suspensao
// administrativa) e de Usuario.deletadoEm (exclusao) — tres perguntas
// diferentes, tres campos diferentes.
//
// Todas as datas sao tratadas em UTC. `new Date()` e um instante absoluto (nao
// tem fuso), e as colunas do Prisma sao TIMESTAMP(3) gravadas em UTC — o fuso
// da maquina nunca entra na conta.

const ORIGENS = ['VOUCHER', 'PAGAMENTO', 'CORTESIA', 'MIGRACAO'];

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Vigencia e uma comparacao de instante, so isso. `agora` SEMPRE vem do
// servidor: nenhuma data enviada pelo cliente (corpo, header, query) pode
// influenciar essa avaliacao em ponto nenhum do sistema — por isso o parametro
// e' interno, com default no relogio do proprio processo, e nunca e alimentado
// a partir de req.
function licencaVigente(licenca, agora = new Date()) {
  return licenca != null && licenca.expiraEm > agora;
}

// Dias inteiros que faltam ate o vencimento, arredondados para CIMA e nunca
// negativos: uma licenca que vence daqui a 30 minutos ainda mostra "1 dia", e
// uma vencida ha um mes mostra 0 (nao -30).
function diasRestantes(licenca, agora = new Date()) {
  if (!licenca) return 0;
  const restanteMs = licenca.expiraEm.getTime() - agora.getTime();
  if (restanteMs <= 0) return 0;
  return Math.ceil(restanteMs / MS_POR_DIA);
}

// Formato publico da licenca, usado por GET /api/auth/me. Devolve null (nunca
// omite a chave) quando o usuario nao tem licenca, pra o cliente distinguir
// "sem licenca" de "campo ausente por versao antiga da API".
function licencaPublica(licenca, agora = new Date()) {
  if (!licenca) return null;
  return {
    vigente: licencaVigente(licenca, agora),
    expiraEm: licenca.expiraEm.toISOString(),
    diasRestantes: diasRestantes(licenca, agora),
    origem: licenca.origem,
  };
}

// Concede `dias` de licenca a um usuario, dentro de uma transacao recebida por
// parametro (nunca abre a sua propria: quem chama decide o escopo atomico —
// no cadastro, por exemplo, a licenca precisa nascer na MESMA transacao que
// cria o usuario e consome o voucher).
//
// Acumulo:
//   base         = max(agora, licencaAtual?.expiraEm ?? agora)
//   novaValidade = base + dias
//
// Ou seja: renovar antes do vencimento EMPILHA no fim da licenca vigente (nao
// desperdica o que ainda restava); renovar depois do vencimento comeca HOJE —
// nao retroage e nao devolve os dias perdidos no periodo sem licenca.
//
// Sempre grava uma ConcessaoLicenca, mesmo quando a Licenca ja existia: a
// tabela de concessoes e o historico de auditoria (append-only) e e o unico
// lugar que explica por que a validade corrente e a que e. Nunca sobrescrever,
// nunca apagar.
async function concederLicenca(tx, { usuarioId, dias, origem, referenciaId = null }, agora = new Date()) {
  if (!usuarioId) throw new Error('concederLicenca: usuarioId e obrigatorio.');
  if (!Number.isInteger(dias) || dias <= 0) {
    throw new Error(`concederLicenca: dias precisa ser inteiro positivo (recebido: ${dias}).`);
  }
  if (!ORIGENS.includes(origem)) {
    throw new Error(`concederLicenca: origem invalida "${origem}". Use uma de: ${ORIGENS.join(', ')}.`);
  }

  const atual = await tx.licenca.findUnique({ where: { usuarioId } });

  const expiraEmAnterior = atual ? atual.expiraEm : null;
  const base = atual && atual.expiraEm > agora ? atual.expiraEm : agora;
  const expiraEmNovo = new Date(base.getTime() + dias * MS_POR_DIA);

  const licenca = await tx.licenca.upsert({
    where: { usuarioId },
    // inicioEm marca o comeco do periodo CORRENTE de posse de licenca: na
    // criacao e agora; numa renovacao empilhada o periodo nunca foi
    // interrompido, entao o inicio original e preservado (nao esta em `update`).
    create: { usuarioId, inicioEm: agora, expiraEm: expiraEmNovo, origem },
    update: { expiraEm: expiraEmNovo, origem },
  });

  await tx.concessaoLicenca.create({
    data: { usuarioId, dias, origem, referenciaId, expiraEmAnterior, expiraEmNovo },
  });

  return licenca;
}

module.exports = {
  ORIGENS,
  MS_POR_DIA,
  licencaVigente,
  diasRestantes,
  licencaPublica,
  concederLicenca,
};
