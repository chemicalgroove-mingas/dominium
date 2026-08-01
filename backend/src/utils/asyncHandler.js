// Express 4 nao propaga rejeicoes de handlers async para o error handler
// automaticamente — um erro sincrono ou uma promise rejeitada dentro de uma
// rota "async (req, res) => {...}" sem try/catch trava a requisicao ate o
// timeout da plataforma em vez de responder com erro. Este wrapper garante
// que qualquer excecao vire um res.status(500) previsivel, nunca um hang.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
