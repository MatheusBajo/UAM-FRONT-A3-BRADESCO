// src/types/pix.ts
export interface PixRequest {
    clienteId: number
    chavePixDestino: string
    valor: number | string
}

export interface PixResponse {
    codigoPix: string
    base64Qr: string
    mensagem:   string
    chaveDestino: string
}

/* NOVOS tipos, vindos de TransacaoController */
export interface TransacaoRequest {
    valor: number
    chaveDestino: string
    tipoChave: 'ALEATORIA' | 'EMAIL' | 'CPF' | 'CELULAR'
    descricao: string
    remetenteId: number
    destinatarioId: number
}

export interface AnaliseResponse {
    status: string           // OK / ERRO
    mensagem: string
    risco: 'BAIXO' | 'MEDIO' | 'ALTO'
    pontuacaoRisco: number   // 0-100
    recomendacao: string
}
