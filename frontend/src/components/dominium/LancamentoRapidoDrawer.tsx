"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useInstancias } from "@/contexts/InstanciasContext";
import { CampoMoeda } from "@/components/dominium/CampoMoeda";
import { CampoPrazoMeses } from "@/components/dominium/CampoPrazoMeses";
import { validarValorCentavos } from "@/lib/validacaoLancamento";
import { mesAtual } from "@/lib/mes";
import { enqueuarCriacaoLancamento } from "@/lib/offline/outbox";
import { tentarSincronizar } from "@/lib/offline/syncManager";
import type { Instancia } from "@/lib/types";

// Atalho operacional pra registrar uma despesa em poucos toques. Nao tem
// logica financeira propria: monta o mesmo payload de POST /api/lancamentos
// (via pipeline offline-first ja existente) e deixa o backend calcular tudo
// (competencia, parcelas). Sempre "temporario": um gasto do dia a dia e, por
// natureza, uma compra pontual (eventualmente parcelada) — nao uma conta fixa
// recorrente, que continua sendo lancada no fluxo completo de Lancamentos.
export function LancamentoRapidoDrawer({
  aberto,
  onFechar,
  onToast,
}: {
  aberto: boolean;
  onFechar: () => void;
  onToast: (mensagem: string) => void;
}) {
  const { usuario } = useAuth();
  const { porGrupo } = useInstancias();
  const instanciasGasto = porGrupo("gasto");

  const [instanciaSelecionada, setInstanciaSelecionada] = useState<Instancia | null>(null);
  const [descricao, setDescricao] = useState("");
  const [valorCentavos, setValorCentavos] = useState(0);
  const [prazoMeses, setPrazoMeses] = useState<number | "">(1);
  const [erro, setErro] = useState("");
  const [erroDescricao, setErroDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Limpa os campos de um lancamento pra permitir o proximo em seguida, sem
  // perder a instancia selecionada — agiliza lancamentos consecutivos na
  // mesma instancia (ex.: varias compras de Mercado seguidas).
  function limparCamposMantendoInstancia() {
    setDescricao("");
    setValorCentavos(0);
    setPrazoMeses(1);
    setErro("");
    setErroDescricao("");
  }

  function fecharTudo() {
    limparCamposMantendoInstancia();
    setInstanciaSelecionada(null);
    onFechar();
  }

  async function salvar(manterAberto: boolean) {
    if (!usuario) return;

    if (!instanciaSelecionada) {
      setErro("Selecione uma instância para registrar.");
      return;
    }
    const descricaoTratada = descricao.trim();
    if (!descricaoTratada) {
      setErroDescricao("Informe uma descrição.");
      return;
    }
    const erroValor = validarValorCentavos(valorCentavos);
    if (erroValor) {
      setErro(erroValor);
      return;
    }
    const parcelas = prazoMeses && prazoMeses >= 1 ? prazoMeses : 1;

    setSalvando(true);
    setErro("");
    setErroDescricao("");
    try {
      // Mesmo campo/modelo de descricao dos lancamentos normais
      // (baseSchema.descricao em backend/src/routes/lancamentos.js) — nao ha
      // estrutura paralela, o texto digitado aqui e' o que aparece depois no
      // historico/listagem de Lancamentos.
      const payload = {
        instanciaId: instanciaSelecionada.id,
        descricao: descricaoTratada,
        valor: valorCentavos / 100,
        tipo: "temporario" as const,
        parcelas,
        mesInicio: mesAtual(),
        observacoes: null,
      };

      // Mesmo pipeline usado pelo form completo: enfileira, sincroniza em
      // segundo plano (ou quando a rede voltar) — nunca api.post direto.
      await enqueuarCriacaoLancamento(usuario.id, payload);
      tentarSincronizar(usuario.id);

      onToast(`${descricaoTratada} · registrado.`);

      if (manterAberto) {
        limparCamposMantendoInstancia();
      } else {
        fecharTudo();
      }
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div
        className="fixed inset-0 z-40"
        onClick={fecharTudo}
        aria-hidden
      />
      <div className="card-dominium relative z-50 flex max-h-[90dvh] w-full max-w-sm flex-col rounded-b-none p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-b-2xl">
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="font-brand text-lg text-cream-100">Lançamento rápido</h2>
          <button onClick={fecharTudo} aria-label="Fechar" className="p-1 text-cream-100/50 hover:text-cream-100">
            <X size={18} />
          </button>
        </div>

        {/* Area rolavel: com o teclado mobile aberto, a viewport visivel
            encolhe (max-h-[90dvh] acompanha isso) — o conteudo rola aqui
            dentro em vez de empurrar os botoes de salvar pra fora da tela. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <p className="mb-2 text-sm text-cream-100/70">Instância</p>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {instanciasGasto.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setInstanciaSelecionada(i)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-2.5 text-center ${
                  instanciaSelecionada?.id === i.id ? "border-gold-500 bg-gold-500/10" : "border-navy-700"
                }`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: i.cor }} />
                <span className="w-full truncate text-[11px] text-cream-100/80">{i.nome}</span>
              </button>
            ))}
            {instanciasGasto.length === 0 && (
              <p className="col-span-3 py-2 text-center text-xs text-cream-100/50">
                Nenhuma instância de gasto cadastrada.
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-sm text-cream-100/80">Descrição</label>
            <input
              className="input-dominium"
              value={descricao}
              onChange={(e) => {
                setDescricao(e.target.value);
                setErroDescricao("");
              }}
              placeholder="Ex.: Supermercado, mensalidade, compra notebook..."
            />
            {erroDescricao && <p className="mt-1 text-xs text-danger">{erroDescricao}</p>}
          </div>

          <div className="mb-2 grid grid-cols-2 gap-3">
            <CampoMoeda label="Valor" valorCentavos={valorCentavos} onChange={setValorCentavos} />
            <CampoPrazoMeses label="Parcelas" value={prazoMeses} onChange={setPrazoMeses} />
          </div>

          {erro && <p className="mt-2 text-sm text-danger">{erro}</p>}
        </div>

        <div className="mt-4 grid shrink-0 grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => salvar(false)}
            disabled={salvando}
            className="btn-gold min-h-[44px] text-sm"
          >
            Salvar registro
          </button>
          <button
            type="button"
            onClick={() => salvar(true)}
            disabled={salvando}
            className="min-h-[44px] rounded-xl border border-gold-500/60 text-sm text-gold-300"
          >
            Salvar e lançar outro
          </button>
        </div>
      </div>
    </div>
  );
}
