import axios from 'axios'
import type {
    PixRequest,
    PixResponse,
    TransacaoRequest,
    AnaliseResponse,
} from '@/types/pix'

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api',
})

export const gerarPix = (payload: PixRequest) =>
    api.post<PixResponse>('/pix', payload).then(r => r.data)

// chamar IA antes de gerar QR (validação do destinatário)
export const analisarTransacao = (t: TransacaoRequest) =>
    api.post<AnaliseResponse>('/transacoes/analisar', t).then(r => r.data)
