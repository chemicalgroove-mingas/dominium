export function limparCpf(cpf: string) {
  return (cpf || "").replace(/\D/g, "");
}

export function formatarCpf(valor: string) {
  const numeros = limparCpf(valor).slice(0, 11);
  return numeros
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function cpfValido(cpf: string) {
  const numeros = limparCpf(cpf);
  if (numeros.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(numeros)) return false;

  const calcularDigito = (base: string) => {
    let soma = 0;
    let peso = base.length + 1;
    for (const char of base) {
      soma += parseInt(char, 10) * peso;
      peso -= 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const base9 = numeros.slice(0, 9);
  const digito1 = calcularDigito(base9);
  const digito2 = calcularDigito(base9 + digito1);

  return numeros === base9 + String(digito1) + String(digito2);
}
