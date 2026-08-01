// Normaliza um login para comparacao/gravacao: minusculas, sem espacos nas
// pontas, sem acentos. "Bruno", "bruno ", "BRUNO" e "Brúno" viram todos "bruno".
function normalizarLogin(valor) {
  return (valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

module.exports = { normalizarLogin };
