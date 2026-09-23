import { useEffect, useRef, useState } from 'react';
import { Eraser } from 'lucide-react';

// O CAMPO DE ASSINATURA — `<canvas>` + `toDataURL()`, sem biblioteca.
//
// Assinar É OPCIONAL, e é uma decisão, não uma omissão: o que prova o aceite é
// a LINHA (`acceptedAt`, com o token de uso único que só quem recebeu o e-mail
// tinha). O desenho é reforço documental. Exigi-lo deixaria de fora quem abre o
// link pelo celular com a tela quebrada, e a resposta a isso não pode ser
// "então não assina".
//
// PONTEIRO, não mouse: `pointerdown/move/up` cobre mouse, toque e caneta com um
// conjunto de eventos só — e a maioria destes termos é assinada no celular.

interface AssinaturaCanvasProps {
  onMudar: (dataUrl: string | null) => void;
  desabilitado?: boolean;
}

export default function AssinaturaCanvas({ onMudar, desabilitado }: AssinaturaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // O canvas é dimensionado em PIXEL REAL, não em CSS: sem isto o traço sai
    // borrado em tela retina, e a assinatura que vai para o PDF é a imagem
    // borrada — não a que a pessoa viu ao desenhar.
    const escala = window.devicePixelRatio || 1;
    const caixa = canvas.getBoundingClientRect();
    canvas.width = caixa.width * escala;
    canvas.height = caixa.height * escala;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
  }, []);

  const ponto = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    return { x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
  };

  const comecar = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (desabilitado) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    // `setPointerCapture`: o traço continua se o dedo sair do quadrado e voltar,
    // em vez de cortar no meio de uma letra.
    evento.currentTarget.setPointerCapture(evento.pointerId);
    desenhando.current = true;

    const { x, y } = ponto(evento);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const mover = (evento: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const { x, y } = ponto(evento);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!temTraco) setTemTraco(true);
  };

  const terminar = () => {
    if (!desenhando.current) return;
    desenhando.current = false;

    const canvas = canvasRef.current;
    if (canvas) onMudar(canvas.toDataURL('image/png'));
  };

  const limpar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemTraco(false);
    onMudar(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-text-tertiary text-[10px] uppercase tracking-widest">
          Assinatura (opcional)
        </span>
        {temTraco && (
          <button
            type="button"
            onClick={limpar}
            disabled={desabilitado}
            className="flex items-center gap-1.5 text-text-tertiary hover:text-text-primary text-[10px] uppercase tracking-widest"
          >
            <Eraser size={11} /> Limpar
          </button>
        )}
      </div>

      <canvas
        ref={canvasRef}
        onPointerDown={comecar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        // `touch-none` impede o navegador de rolar a página enquanto o dedo
        // desenha — sem ele, assinar no celular move a tela em vez de traçar.
        className="w-full h-32 bg-white border border-border-sutil cursor-crosshair touch-none"
      />
    </div>
  );
}
