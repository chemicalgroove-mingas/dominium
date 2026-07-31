// Utilitarios de aritmetica sobre chaves de mes no formato "YYYY-MM".
// Nunca usar Date puro para isso: meses tem duracao variavel e o modelo
// trabalha com competencia (mes de referencia), nao com datas de calendario.

function parseMes(chave) {
  const match = /^(\d{4})-(\d{2})$/.exec(chave || '');
  if (!match) throw new Error(`Mes invalido: "${chave}". Use o formato YYYY-MM.`);
  return { ano: parseInt(match[1], 10), mes: parseInt(match[2], 10) };
}

function mesParaIndice({ ano, mes }) {
  return ano * 12 + (mes - 1);
}

function indiceParaMes(indice) {
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function somarMeses(chave, delta) {
  const indice = mesParaIndice(parseMes(chave)) + delta;
  return indiceParaMes(indice);
}

function diferencaEmMeses(chaveA, chaveB) {
  return mesParaIndice(parseMes(chaveB)) - mesParaIndice(parseMes(chaveA));
}

function compararMeses(chaveA, chaveB) {
  return mesParaIndice(parseMes(chaveA)) - mesParaIndice(parseMes(chaveB));
}

function maiorMes(chaveA, chaveB) {
  return compararMeses(chaveA, chaveB) >= 0 ? chaveA : chaveB;
}

function menorMes(chaveA, chaveB) {
  return compararMeses(chaveA, chaveB) <= 0 ? chaveA : chaveB;
}

function mesAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

function ultimoDiaDoMes(chave) {
  const { ano, mes } = parseMes(chave);
  return new Date(Date.UTC(ano, mes, 0));
}

function listarMeses(chaveInicio, quantidade) {
  const lista = [];
  for (let i = 0; i < quantidade; i += 1) {
    lista.push(somarMeses(chaveInicio, i));
  }
  return lista;
}

module.exports = {
  parseMes,
  somarMeses,
  diferencaEmMeses,
  compararMeses,
  maiorMes,
  menorMes,
  mesAtual,
  ultimoDiaDoMes,
  listarMeses,
};
