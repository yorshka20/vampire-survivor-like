export function getItemShape(type: 'health' | 'weapon' | 'buff'): 'circle' | 'rect' | 'triangle' {
  switch (type) {
    case 'health':
      return 'circle';
    case 'weapon':
      return 'rect';
    case 'buff':
      return 'triangle';
  }
}
