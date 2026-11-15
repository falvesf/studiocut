export const TRANSITION_CATEGORIES = [
  { id: 'all', label: 'Todas' },
  { id: 'classic', label: 'Clássicas' },
  { id: 'slide', label: 'Deslizar' },
  { id: 'wipe', label: 'Cortinas' },
  { id: 'shape', label: 'Câmera & Formas' }
];

export const TRANSITIONS_CATALOG = [
  { id: 'none', name: 'Corte Direto', category: 'classic', xfade: null, desc: 'Sem transição' },
  { id: 'fade', name: 'Dissolver (Crossfade)', category: 'classic', xfade: 'fade', desc: 'Fusão suave entre trechos' },
  { id: 'fadeblack', name: 'Esmaecer Preto', category: 'classic', xfade: 'fadeblack', desc: 'Passagem pelo preto' },
  { id: 'fadewhite', name: 'Flash Branco', category: 'classic', xfade: 'fadewhite', desc: 'Flash de luz estilo CapCut' },
  { id: 'dissolve', name: 'Dissolver Granulado', category: 'classic', xfade: 'dissolve', desc: 'Transição pontilhada clássica' },

  { id: 'slideleft', name: 'Deslizar Esquerda', category: 'slide', xfade: 'slideleft', desc: 'Empurra para a esquerda' },
  { id: 'slideright', name: 'Deslizar Direita', category: 'slide', xfade: 'slideright', desc: 'Empurra para a direita' },
  { id: 'slideup', name: 'Deslizar Acima', category: 'slide', xfade: 'slideup', desc: 'Sobe para o próximo trecho' },
  { id: 'slidedown', name: 'Deslizar Abaixo', category: 'slide', xfade: 'slidedown', desc: 'Desce para o próximo trecho' },
  { id: 'smoothleft', name: 'Suave Esquerda', category: 'slide', xfade: 'smoothleft', desc: 'Deslizamento suave com fade' },
  { id: 'smoothright', name: 'Suave Direita', category: 'slide', xfade: 'smoothright', desc: 'Deslizamento suave reverso' },

  { id: 'wipeleft', name: 'Cortina Esquerda', category: 'wipe', xfade: 'wipeleft', desc: 'Revela da direita para esquerda' },
  { id: 'wiperight', name: 'Cortina Direita', category: 'wipe', xfade: 'wiperight', desc: 'Revela da esquerda para direita' },
  { id: 'wipeup', name: 'Cortina Acima', category: 'wipe', xfade: 'wipeup', desc: 'Revela de baixo para cima' },
  { id: 'wipedown', name: 'Cortina Abaixo', category: 'wipe', xfade: 'wipedown', desc: 'Revela de cima para baixo' },
  { id: 'horzopen', name: 'Abrir Horizontal', category: 'wipe', xfade: 'horzopen', desc: 'Abre do centro para os lados' },
  { id: 'vertopen', name: 'Abrir Vertical', category: 'wipe', xfade: 'vertopen', desc: 'Abre do centro para cima/baixo' },

  { id: 'circleopen', name: 'Círculo Abrir', category: 'shape', xfade: 'circleopen', desc: 'Íris circular abrindo' },
  { id: 'circleclose', name: 'Círculo Fechar', category: 'shape', xfade: 'circleclose', desc: 'Íris circular fechando' },
  { id: 'zoomin', name: 'Zoom Câmera', category: 'shape', xfade: 'zoomin', desc: 'Aproximação dinâmica' },
  { id: 'radial', name: 'Giro Radial', category: 'shape', xfade: 'radial', desc: 'Varredura em relógio 360°' },
  { id: 'pixelize', name: 'Pixelizar / Glitch', category: 'shape', xfade: 'pixelize', desc: 'Efeito mosaico digital' },
  { id: 'diagtl', name: 'Diagonal', category: 'shape', xfade: 'diagtl', desc: 'Corte diagonal dinâmico' }
];

export function getTransitionMeta(id) {
  return TRANSITIONS_CATALOG.find((t) => t.id === id) || TRANSITIONS_CATALOG[0];
}
