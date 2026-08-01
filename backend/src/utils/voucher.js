const crypto = require('crypto');

// Sem caracteres ambiguos (0/O, 1/I/L) para reduzir erro de digitacao ao repassar o voucher.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function segmento(tamanho) {
  const bytes = crypto.randomBytes(tamanho);
  let saida = '';
  for (let i = 0; i < tamanho; i += 1) {
    saida += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return saida;
}

// Formato DOM-XXXX-XXXX-XXXX (prefixo + 3 segmentos), gerado com crypto.randomBytes.
function gerarCodigoVoucher({ prefixo = 'DOM', segmentos = 3, comprimento = 4 } = {}) {
  const partes = [];
  for (let i = 0; i < segmentos; i += 1) {
    partes.push(segmento(comprimento));
  }
  return `${prefixo}-${partes.join('-')}`;
}

module.exports = { gerarCodigoVoucher };
