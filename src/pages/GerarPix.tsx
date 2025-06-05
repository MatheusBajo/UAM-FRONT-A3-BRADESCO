// src/pages/GerarPix.tsx
import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Drawer,
    DrawerTrigger,
    DrawerContent,
    DrawerHeader,
    DrawerTitle,
    DrawerDescription,
    DrawerFooter,
    DrawerClose,
} from "@/components/ui/drawer";
import { Warning, QrCode } from "@phosphor-icons/react";
import { analisarTransacao, gerarPix } from "@/services/pixService";
import type { PixRequest, TransacaoRequest, AnaliseResponse } from "@/types/pix";
import { toast } from "sonner";

/* util rápido: formata número (centavos) para BRL */
const formatBRL = (valor: number) =>
    (valor / 100).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });

export default function GerarPix() {
    /* estado */
    const [clienteId, setClienteId] = useState("1");
    const [chaveDestino, setChaveDestino] = useState("123412341234@pix");
    const [valorCentavos, setValorCentavos] = useState(10000); // 100,00
    const [inputValor, setInputValor] = useState(formatBRL(10000));
    const [qr, setQr] = useState("");
    const [fraude, setFraude] = useState(false);
    const [analise, setAnalise] = useState<AnaliseResponse | null>(null);
    const [payloadParaGerar, setPayloadParaGerar] = useState<PixRequest | null>(
        null,
    );

    /* loading states */
    const [isPending, startTransition] = useTransition(); // loading do botão
    const [loadingQr, setLoadingQr] = useState(false); // skeleton do QR

    /* masks & handlers */
    const handleClienteIdChange = (e: React.ChangeEvent<HTMLInputElement>) =>
        setClienteId(e.target.value.replace(/\D/g, ""));

    const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const onlyDigits = e.target.value.replace(/\D/g, "");
        if (onlyDigits === "") {
            setValorCentavos(0);
            setInputValor("");
            return;
        }
        const centavos = parseInt(onlyDigits, 10);
        setValorCentavos(centavos);
        setInputValor(formatBRL(centavos));
    };

    /* fluxo principal */
    const enviar = (e: React.FormEvent) => {
        e.preventDefault();
        setQr("");
        setLoadingQr(true);

        if (!clienteId || !chaveDestino || valorCentavos === 0) {
            toast.error("Preencha todos os campos.");
            setLoadingQr(false);
            return;
        }

        startTransition(async () => {
            const numeroCliente = parseInt(clienteId, 10);
            const valorDecimal = valorCentavos / 100;

            /* 1 - análise */
            const analisePayload: TransacaoRequest = {
                valor: valorDecimal,
                chaveDestino,
                tipoChave: "ALEATORIA",
                descricao: "Geração de QR Code",
                remetenteId: numeroCliente,
                destinatarioId: 0,
            };

            try {
                const resultado = await analisarTransacao(analisePayload);
                setAnalise(resultado);

                if (resultado.risco === "ALTO") {
                    setFraude(true);
                    setPayloadParaGerar({
                        clienteId: numeroCliente,
                        chavePixDestino: chaveDestino,
                        valor: valorDecimal,
                    });
                    setLoadingQr(false);
                    return;
                }
            } catch (err: any) {
                const msg =
                    err.response?.data?.mensagem ??
                    err.message ??
                    "Serviço de análise indisponível";
                toast.error(msg);
                setLoadingQr(false);
                return;
            }

            /* 2 - gera QR */
            const promise = gerarPix({
                clienteId: numeroCliente,
                chavePixDestino: chaveDestino,
                valor: valorDecimal,
            }).then((res) => {
                setQr(res.base64Qr);
                setLoadingQr(false);
                return "PIX gerado com sucesso!";
            });

            toast.promise(promise, {
                loading: "Gerando QR Code…",
                success: (m) => m,
                error: "Falha ao gerar PIX",
            });

            await promise;
        });
    };

    /* usuário prossegue com risco alto */
    const prosseguirMesmoComFraude = async () => {
        if (!payloadParaGerar) return;
        setFraude(false);
        setLoadingQr(true);

        const promise = gerarPix(payloadParaGerar).then((res) => {
            setQr(res.base64Qr);
            setLoadingQr(false);
            return "PIX gerado mesmo assim.";
        });

        toast.promise(promise, {
            loading: "Gerando QR Code…",
            success: (m) => m,
            error: "Não foi possível gerar o PIX",
        });

        await promise;
    };

    /* UI */
    return (
        <section className="mx-auto w-full max-w-3xl p-4">
            <header className="mb-6 text-center">
                <h1 className="text-3xl font-extrabold tracking-tight">Gerar PIX</h1>
                <p className="text-muted-foreground">
                    Crie rapidamente um QR Code de pagamento
                </p>
            </header>

            <div className="flex flex-col gap-6 md:flex-row">
                {/* formulário */}
                <form onSubmit={enviar} className="flex-1 space-y-4">
                    <div>
                        <Label htmlFor="id">Cliente ID</Label>
                        <Input
                            id="id"
                            type="text"
                            value={clienteId}
                            onChange={handleClienteIdChange}
                            placeholder="Somente números"
                            autoComplete="off"
                        />
                    </div>

                    <div>
                        <Label htmlFor="chave">Chave destino</Label>
                        <Input
                            id="chave"
                            type="text"
                            value={chaveDestino}
                            onChange={(e) => setChaveDestino(e.target.value)}
                            autoComplete="off"
                        />
                    </div>

                    <div>
                        <Label htmlFor="valor">Valor (R$)</Label>
                        <Input
                            id="valor"
                            type="text"
                            value={inputValor}
                            onChange={handleValorChange}
                            placeholder="0,00"
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isPending}
                        aria-busy={isPending}
                    >
                        {isPending ? (
                            <span className="flex items-center gap-2">
                <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                >
                  <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                  />
                  <path
                      className="opacity-75"
                      d="M4 12a8 8 0 018-8"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                  />
                </svg>
                Gerando…
              </span>
                        ) : (
                            "Gerar PIX"
                        )}
                    </Button>
                </form>

                {/* QR gerado */}
                <aside className="flex w-full max-w-xs flex-col items-center justify-center gap-4 self-start rounded-lg border bg-card p-4 shadow-sm">
                    <header className="flex items-center gap-2 font-semibold">
                        <QrCode className="h-5 w-5" />
                        QR Code
                    </header>

                    {loadingQr ? (
                        <Skeleton className="h-44 w-44 rounded" />
                    ) : qr ? (
                        <img
                            src={`data:image/png;base64,${qr}`}
                            alt="QR Code PIX"
                            className="h-44 w-44 rounded border"
                        />
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Gere o QR para exibir aqui
                        </p>
                    )}
                </aside>
            </div>

            {/* Drawer de fraude */}
            {fraude && analise && (
                <Drawer open={fraude} onOpenChange={setFraude}>
                    <DrawerTrigger asChild>
                        <Button variant="secondary">Abrir Aviso</Button>
                    </DrawerTrigger>

                    <DrawerContent className="mx-auto h-full max-h-[80vh] overflow-hidden rounded-lg bg-background shadow-xl">
                        <div className="flex h-full flex-col">
                            <DrawerHeader className="border-b px-6 py-4">
                                <div className="flex items-start">
                                    <div className="rounded-full bg-red-100 p-2">
                                        <Warning weight="bold" className="text-2xl text-red-700" />
                                    </div>
                                    <h3 className="ml-3 text-2xl font-extrabold text-destructive">
                                        Conta suspeita
                                    </h3>
                                </div>
                                <DrawerDescription className="mt-3">
                                    Identificamos atividade suspeita. Revise antes de prosseguir.
                                </DrawerDescription>
                                <p className="mt-3 text-sm text-muted-foreground">
                                    • Risco: {analise.risco} ({analise.pontuacaoRisco}%)
                                    <br />• Recomendação: {analise.recomendacao}
                                </p>
                            </DrawerHeader>

                            <DrawerFooter className="mt-auto flex flex-col gap-2 border-t px-6 py-4">
                                <DrawerClose asChild>
                                    <Button variant="outline">Cancelar</Button>
                                </DrawerClose>
                                <Button variant="destructive" onClick={prosseguirMesmoComFraude}>
                                    Continuar mesmo assim
                                </Button>
                            </DrawerFooter>
                        </div>
                    </DrawerContent>
                </Drawer>
            )}
        </section>
    );
}
