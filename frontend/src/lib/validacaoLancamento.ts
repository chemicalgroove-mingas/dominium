import { centavosParaNumero } from "@/lib/moeda";

// Unica fonte da validacao de UX minima de valor, usada tanto pelo form
// completo de Lancamentos quanto pelo Lancamento Rapido — nunca reimplementar
// esta checagem em outro lugar (regra de negocio real fica no backend).
export function validarValorCentavos(valorCentavos: number): string | null {
  const valorNumerico = centavosParaNumero(valorCentavos);
  if (!valorNumerico || valorNumerico <= 0) {
    return "Informe um valor maior que zero.";
  }
  return null;
}
