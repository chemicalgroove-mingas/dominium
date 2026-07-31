export function formatarCentavos(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function centavosParaNumero(centavos: number) {
  return centavos / 100;
}

export function numeroParaCentavos(valor: number) {
  return Math.round(valor * 100);
}

export function digitosParaCentavos(valorDigitado: string) {
  const digitos = valorDigitado.replace(/\D/g, "");
  return digitos ? parseInt(digitos, 10) : 0;
}
