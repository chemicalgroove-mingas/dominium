function limparCpf(cpf) {
  return (cpf || '').replace(/\D/g, '');
}

function formatarCpf(cpf) {
  const numeros = limparCpf(cpf);
  if (numeros.length !== 11) return cpf || '';
  return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function cpfValido(cpf) {
  const numeros = limparCpf(cpf);
  if (numeros.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(numeros)) return false;

  const calcularDigito = (base) => {
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

module.exports = { limparCpf, formatarCpf, cpfValido };
