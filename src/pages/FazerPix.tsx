import { useState, useTransition, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Drawer, DrawerTrigger, DrawerContent,
    DrawerHeader, DrawerTitle, DrawerDescription,
    DrawerFooter, DrawerClose,
} from '@/components/ui/drawer';

import { toast } from 'sonner';
import { Warning, ShieldSlash, CircleNotch, Check, X } from '@phosphor-icons/react';
import { Loader2 } from 'lucide-react';

import { analisarTransacao } from '@/services/pixService';
import type { AnaliseResponse, TransacaoRequest } from '@/types/pix';

/* ---------- helpers ---------- */
const bottomBorder = (err = false) =>
    `border-1 border-b ${err ? 'border-b-red-500 border-b-3 focus-visible:ring-0' : 'border-b-muted'}`;

// Detectar tipo de chave PIX
const detectarTipoChave = (chave: string): 'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA' | '' => {
    // Remover espaços e caracteres especiais para análise
    const chaveLimpa = chave.replace(/\D/g, '');

    // Email: contém @ e . com formato válido
    if (chave.includes('@') && chave.includes('.') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave)) {
        return 'EMAIL';
    }

    // CNPJ: exatamente 14 dígitos
    if (chaveLimpa.length === 14 && /^\d+$/.test(chaveLimpa)) {
        return 'CNPJ';
    }

    // Telefone: 10 ou 11 dígitos começando com DDD válido (11-99)
    if (chaveLimpa.length === 10 || chaveLimpa.length === 11) {
        const ddd = parseInt(chaveLimpa.substring(0, 2));
        if (ddd >= 11 && ddd <= 99) {
            // Se tem 11 dígitos, o terceiro deve ser 9 (celular)
            if (chaveLimpa.length === 11 && chaveLimpa[2] === '9') {
                return 'TELEFONE';
            }
            // Se tem 10 dígitos, é telefone fixo
            if (chaveLimpa.length === 10) {
                return 'TELEFONE';
            }
        }
    }

    // CPF: exatamente 11 dígitos que não seja telefone
    if (chaveLimpa.length === 11 && /^\d+$/.test(chaveLimpa)) {
        return 'CPF';
    }

    // Chave aleatória: UUID ou formato similar
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) {
        return 'ALEATORIA';
    }

    // Se não corresponder a nenhum padrão, retornar vazio
    return '';
};

// Formatar chave baseado no tipo
const formatarChave = (chave: string, tipo: string): string => {
    const apenasNumeros = chave.replace(/\D/g, '');

    switch (tipo) {
        case 'CPF':
            if (apenasNumeros.length <= 11) {
                return apenasNumeros
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
                    .replace(/(-\d{2})\d+?$/, '$1');
            }
            return chave;

        case 'CNPJ':
            if (apenasNumeros.length <= 14) {
                return apenasNumeros
                    .replace(/(\d{2})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d)/, '$1.$2')
                    .replace(/(\d{3})(\d)/, '$1/$2')
                    .replace(/(\d{4})(\d)/, '$1-$2')
                    .replace(/(-\d{2})\d+?$/, '$1');
            }
            return chave;

        case 'TELEFONE':
            if (apenasNumeros.length <= 11) {
                if (apenasNumeros.length === 11) {
                    return apenasNumeros.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
                } else if (apenasNumeros.length === 10) {
                    return apenasNumeros.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
                }
            }
            return chave;

        case 'EMAIL':
            return chave.toLowerCase();

        default:
            return chave;
    }
};

// Formatar valor monetário
const formatarValor = (valor: string): string => {
    const apenasNumeros = valor.replace(/\D/g, '');
    const valorNumerico = parseInt(apenasNumeros) / 100;
    return valorNumerico.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

// Converter valor formatado para número
const valorParaNumero = (valor: string): number => {
    // Remove pontos e troca vírgula por ponto
    return parseFloat(valor.replace(/\./g, '').replace(',', '.'));
};

export default function FazerPix() {
    /* state ------------------------------------------------------------ */
    const [clienteId, setClienteId] = useState('1');
    const [destinatarioId, setDestinatarioId] = useState('2');
    const [chaveDestino, setChaveDestino] = useState('');
    const [tipoChave, setTipoChave] = useState<'CPF' | 'CNPJ' | 'EMAIL' | 'TELEFONE' | 'ALEATORIA'>('EMAIL');
    const [tipoDetectado, setTipoDetectado] = useState<string>('');
    const [valor, setValor] = useState('100,00');
    const [descricao, setDescricao] = useState('');
    const [dataHora, setDataHora] = useState(
        new Date().toISOString().slice(0, 16),
    );

    const [errors, setErrors] = useState<Record<string, boolean>>({});
    const [analise, setAnalise] = useState<AnaliseResponse | null>(null);
    const [drawerOpen, setDrawer] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [isDetectingType, setIsDetectingType] = useState(false);

    const reset = () => {
        setAnalise(null);
        setDrawer(false);
    };

    // Auto-detectar tipo de chave
    useEffect(() => {
        if (chaveDestino.length > 3) {
            setIsDetectingType(true);
            const timer = setTimeout(() => {
                const tipo = detectarTipoChave(chaveDestino);
                if (tipo) {
                    setTipoChave(tipo as any);
                    setTipoDetectado(tipo);
                } else {
                    setTipoDetectado('');
                }
                setIsDetectingType(false);
            }, 1500); // Delay de 1.5 segundos
            return () => clearTimeout(timer);
        } else {
            setTipoDetectado('');
        }
    }, [chaveDestino]);

    // Handlers
    const handleChaveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const novaChave = e.target.value;
        setChaveDestino(novaChave);
    };

    const handleChaveBlur = () => {
        const chaveFormatada = formatarChave(chaveDestino, tipoChave);
        setChaveDestino(chaveFormatada);
    };

    const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const valorFormatado = formatarValor(e.target.value);
        setValor(valorFormatado);
    };

    /* submit ----------------------------------------------------------- */
    async function enviar(e: React.FormEvent) {
        e.preventDefault();
        reset();

        /* validação */
        const err: Record<string, boolean> = {};
        if (!clienteId) err.clienteId = true;
        if (!destinatarioId) err.destinatarioId = true;
        if (!chaveDestino) err.chaveDestino = true;
        if (!valor || valor === '0,00') err.valor = true;
        if (clienteId && destinatarioId && clienteId === destinatarioId)
            err.mesmoId = true;
        if (!dataHora) err.dataHora = true;

        if (Object.keys(err).length) {
            setErrors(err);
            toast.error(
                err.mesmoId
                    ? 'Não é possível enviar Pix para si mesmo.'
                    : 'Preencha todos os campos obrigatórios.',
                {
                    duration: 3000,
                    icon: <X weight="bold" className="text-red-500" />
                },
            );
            return;
        }
        setErrors({});

        /* payload */
        const payload: TransacaoRequest = {
            valor: String(valorParaNumero(valor)), // Converte para número e depois para string
            chaveDestino,
            tipoChave,
            descricao: descricao || `Pix para ${chaveDestino}`,
            remetenteId: Number(clienteId),
            destinatarioId: Number(destinatarioId),
            dataHora: dataHora || new Date().toISOString().slice(0, 16),
        };

        /* chamada */
        const loadingToast = toast.loading('Analisando transação...', {
            description: 'Verificando padrões de segurança',
            icon: <CircleNotch weight="bold" className="animate-spin" />
        });

        startTransition(async () => {
            try {
                const data = await analisarTransacao(payload);
                setAnalise(data);

                console.log('Análise de transação:', data);

                toast.dismiss(loadingToast);

                if (data.acao_recomendada === 'BLOQUEAR') {
                    toast.error(`Transação bloqueada! (Risco: ${data.pontuacao_risco}%)`, {
                        duration: 5000,
                        description: 'Detectamos atividade suspeita',
                        icon: <ShieldSlash weight="bold" className="text-red-600" />
                    });
                    setDrawer(true);
                } else if (data.acao_recomendada === 'ALERTAR') {
                    toast.warning(`Atenção necessária (Risco: ${data.pontuacao_risco}%)`, {
                        duration: 4000,
                        description: 'Verifique os detalhes da transação',
                        icon: <Warning weight="bold" className="text-yellow-600" />
                    });
                    setDrawer(true);
                } else {
                    toast.success(`Transação aprovada! (Risco: ${data.pontuacao_risco}%)`, {
                        duration: 3000,
                        description: 'Pix enviado com sucesso',
                        icon: <Check weight="bold" className="text-green-600" />
                    });
                }
            } catch (err) {
                toast.dismiss(loadingToast);
                toast.error('Erro ao processar transação', {
                    duration: 4000,
                    description: 'Tente novamente em alguns instantes'
                });
                console.error(err);
            }
        });
    }

    /* ui --------------------------------------------------------------- */
    return (
        <section className="mx-auto w-full max-w-xl p-4">
            <header className="mb-6 text-center relative overflow-hidden rounded-xl shadow-2xl animate-header-entrance">
                {/* Gradiente de fundo animado */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-blue-600 to-purple-600 bg-[length:400%_400%] animate-gradient-shift"></div>

                {/* Partículas flutuantes */}
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute w-64 h-64 bg-white/10 rounded-full blur-3xl -top-20 -left-20 animate-float-slow"></div>
                    <div className="absolute w-96 h-96 bg-blue-400/10 rounded-full blur-3xl -bottom-32 -right-32 animate-float-delayed"></div>
                </div>

                {/* Brilho que passa */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 translate-x-[-200%] animate-shimmer-pass"></div>

                {/* Conteúdo */}
                <div className="relative z-10 p-8">
                    <div className="flex items-center justify-center gap-3 mb-3 animate-icon-entrance">
                        <div className="relative">
                            <ShieldSlash weight="bold" className="h-10 w-10 text-white drop-shadow-2xl"/>
                            <div className="absolute inset-0 bg-white/30 blur-xl animate-pulse-glow"></div>
                        </div>
                        <h1 className="text-4xl font-black uppercase tracking-wider text-white drop-shadow-2xl">
                            PIXSHIELD
                        </h1>
                    </div>
                    <p className="text-white/90 text-lg font-medium drop-shadow-lg animate-text-fade">
                        Sistema Antifraude com Inteligência Artificial
                    </p>
                    <div className="mt-3 flex items-center justify-center gap-6 text-white/80 text-sm animate-stats-fade">
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                            <span>Sistema Ativo</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Check weight="bold" className="h-4 w-4"/>
                            <span>Proteção em Tempo Real</span>
                        </div>
                    </div>
                </div>

                {/* Borda com gradiente */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-400/20 via-transparent to-blue-400/20 pointer-events-none"></div>

                <style jsx>{`
                    @keyframes header-entrance {
                        0% {
                            transform: translateY(-20px) scale(0.95);
                            opacity: 0;
                        }
                        50% {
                            transform: translateY(5px) scale(1.02);
                        }
                        100% {
                            transform: translateY(0) scale(1);
                            opacity: 1;
                        }
                    }
                    
                    @keyframes gradient-shift {
                        0%, 100% {
                            background-position: 0% 50%;
                        }
                        25% {
                            background-position: 100% 50%;
                        }
                        50% {
                            background-position: 50% 100%;
                        }
                        75% {
                            background-position: 50% 0%;
                        }
                    }
                    
                    @keyframes shimmer-pass {
                        0% {
                            transform: translateX(-200%) skewX(-12deg);
                        }
                        100% {
                            transform: translateX(200%) skewX(-12deg);
                        }
                    }
                    
                    @keyframes float-slow {
                        0%, 100% {
                            transform: translate(0, 0) scale(1);
                        }
                        33% {
                            transform: translate(30px, -30px) scale(1.1);
                        }
                        66% {
                            transform: translate(-20px, 20px) scale(0.9);
                        }
                    }
                    
                    @keyframes float-delayed {
                        0%, 100% {
                            transform: translate(0, 0) scale(1);
                        }
                        33% {
                            transform: translate(-40px, 30px) scale(1.1);
                        }
                        66% {
                            transform: translate(30px, -20px) scale(0.95);
                        }
                    }
                    
                    @keyframes icon-entrance {
                        0% {
                            transform: scale(0) rotate(-180deg);
                            opacity: 0;
                        }
                        50% {
                            transform: scale(1.2) rotate(10deg);
                        }
                        100% {
                            transform: scale(1) rotate(0deg);
                            opacity: 1;
                        }
                    }
                    
                    @keyframes text-fade {
                        0% {
                            opacity: 0;
                            transform: translateY(10px);
                        }
                        100% {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    
                    @keyframes stats-fade {
                        0% {
                            opacity: 0;
                            transform: translateY(10px);
                        }
                        100% {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                    
                    @keyframes pulse-glow {
                        0%, 100% {
                            opacity: 0.3;
                            transform: scale(1);
                        }
                        50% {
                            opacity: 0.6;
                            transform: scale(1.5);
                        }
                    }
                    
                    .animate-header-entrance {
                        animation: header-entrance 1.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                    }
                    
                    .animate-gradient-shift {
                        animation: gradient-shift 15s ease infinite;
                    }
                    
                    .animate-shimmer-pass {
                        animation: shimmer-pass 2.5s ease-out 0.8s forwards;
                    }
                    
                    .animate-float-slow {
                        animation: float-slow 20s ease-in-out infinite;
                    }
                    
                    .animate-float-delayed {
                        animation: float-delayed 25s ease-in-out 5s infinite;
                    }
                    
                    .animate-icon-entrance {
                        animation: icon-entrance 1s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
                    }
                    
                    .animate-text-fade {
                        animation: text-fade 0.8s ease-out 0.8s both;
                    }
                    
                    .animate-stats-fade {
                        animation: stats-fade 0.8s ease-out 1.2s both;
                    }
                    
                    .animate-pulse-glow {
                        animation: pulse-glow 3s ease-in-out infinite;
                    }
                `}</style>
            </header>

            <form onSubmit={enviar} className="space-y-5 rounded-xl bg-white p-6 shadow-lg border">
                {/* IDs */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="cli">Remetente (ID)*</Label>
                        <Input
                            id="cli"
                            value={clienteId}
                            onChange={e => setClienteId(e.target.value)}
                            className={bottomBorder(errors.clienteId || errors.mesmoId)}
                            placeholder="ID do remetente"
                        />
                    </div>
                    <div>
                        <Label htmlFor="dest">Destinatário (ID)*</Label>
                        <Input
                            id="dest"
                            value={destinatarioId}
                            onChange={e => setDestinatarioId(e.target.value)}
                            className={bottomBorder(errors.destinatarioId || errors.mesmoId)}
                            placeholder="ID do destinatário"
                        />
                    </div>
                </div>

                {/* chave + tipo integrado */}
                <div>
                    <Label htmlFor="chave">Chave PIX*</Label>
                    <div className="relative">
                        <Input
                            id="chave"
                            value={chaveDestino}
                            onChange={handleChaveChange}
                            onBlur={handleChaveBlur}
                            className={`pr-20 ${bottomBorder(errors.chaveDestino)}`}
                            placeholder="Digite a chave PIX"
                        />
                        {tipoDetectado && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-100 px-2 py-1 rounded text-xs text-gray-600 font-medium">
                                {tipoDetectado}
                            </div>
                        )}
                        {isDetectingType && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-gray-400" />
                            </div>
                        )}
                    </div>
                </div>

                {/* valor + desc */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="valor">Valor (R$)*</Label>
                        <Input
                            id="valor"
                            value={valor}
                            onChange={handleValorChange}
                            className={bottomBorder(errors.valor)}
                            placeholder="0,00"
                        />
                    </div>
                    <div>
                        <Label htmlFor="desc">Descrição</Label>
                        <Input
                            id="desc"
                            value={descricao}
                            onChange={e => setDescricao(e.target.value)}
                            className={bottomBorder(false)}
                            placeholder="Motivo do PIX"
                        />
                    </div>
                </div>

                {/* data/hora */}
                <div>
                    <Label htmlFor="dh">Data & hora*</Label>
                    <Input
                        id="dh"
                        type="datetime-local"
                        value={dataHora}
                        onChange={e => setDataHora(e.target.value)}
                        className={bottomBorder(errors.dataHora)}
                    />
                </div>

                <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    disabled={isPending}
                >
                    {isPending ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processando...
                        </>
                    ) : (
                        'Enviar Pix'
                    )}
                </Button>
            </form>

            {/* Drawer alerta/bloqueio */}
            {analise && drawerOpen && (
                <Drawer open={drawerOpen} onOpenChange={setDrawer}>
                    <DrawerTrigger asChild><span /></DrawerTrigger>
                    <DrawerContent className="mx-auto max-w-lg rounded-t-xl bg-background shadow-2xl">
                        <DrawerHeader className="flex flex-col gap-3 p-6">
                            <div className="mx-auto">
                                {analise.acao_recomendada === 'BLOQUEAR'
                                    ? <ShieldSlash weight="bold" className="h-16 w-16 text-red-600 animate-pulse" />
                                    : <Warning weight="bold" className="h-16 w-16 text-yellow-600 animate-pulse" />}
                            </div>
                            <DrawerTitle className="text-center text-2xl font-extrabold">
                                {analise.acao_recomendada === 'BLOQUEAR' ? 'Transação Bloqueada' : 'Atenção Necessária'}
                            </DrawerTitle>
                            <DrawerDescription className="text-center text-base">
                                {analise.mensagem}
                            </DrawerDescription>

                            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                                <div className="text-center space-y-1">
                                    <div className="text-2xl font-bold text-gray-900">
                                        {analise.pontuacao_risco}%
                                    </div>
                                    <div className="text-sm text-gray-600">
                                        Pontuação de Risco
                                    </div>
                                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold
                                        ${analise.nivel_risco === 'ALTO' ? 'bg-red-100 text-red-700' :
                                        analise.nivel_risco === 'MÉDIO' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-green-100 text-green-700'}`}>
                                        Risco {analise.nivel_risco}
                                    </div>
                                </div>
                            </div>

                            {analise.alertas && JSON.parse(analise.alertas).length > 0 && (
                                <div className="mt-4 space-y-2">
                                    <p className="text-sm font-semibold text-gray-700">Alertas detectados:</p>
                                    <ul className="space-y-1">
                                        {JSON.parse(analise.alertas).map((a: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                                <Warning weight="bold" className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                                <span>{a}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </DrawerHeader>
                        <DrawerFooter className="flex flex-col gap-2 border-t p-6">
                            <DrawerClose asChild>
                                <Button variant="outline" className="w-full">
                                    Entendi
                                </Button>
                            </DrawerClose>
                            {analise.acao_recomendada === 'ALERTAR' && (
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={() => {
                                        toast.warning('Transação forçada pelo usuário', {
                                            description: 'Esta ação foi registrada para auditoria'
                                        });
                                        setDrawer(false);
                                    }}
                                >
                                    Prosseguir mesmo assim
                                </Button>
                            )}
                        </DrawerFooter>
                    </DrawerContent>
                </Drawer>
            )}

        </section>
    );
}