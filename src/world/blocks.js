// ════════════════════════════════════════════════════════════════
//  BLOCK REGISTRY
//  Add new block types here. Each block needs:
//  - name, top/side/bot colors (RGB arrays)
//  - solid: can you walk on it?
//  - opaque: does it hide neighbour faces?
//  - hardness: seconds to break
//  - alpha (optional): transparency 0-1
//  - light (optional): is it a light source?
// ════════════════════════════════════════════════════════════════

export const BD = {
  1:  { name:'Grass',  top:[88,148,50],   side:[118,170,82],  bot:[132,94,40],   solid:true,  opaque:true,  hardness:0.9 },
  2:  { name:'Dirt',   top:[132,94,40],   side:[132,94,40],   bot:[132,94,40],   solid:true,  opaque:true,  hardness:0.8 },
  3:  { name:'Stone',  top:[134,134,134], side:[134,134,134], bot:[134,134,134], solid:true,  opaque:true,  hardness:2.5 },
  4:  { name:'Wood',   top:[158,122,52],  side:[106,74,24],   bot:[158,122,52],  solid:true,  opaque:true,  hardness:1.5 },
  5:  { name:'Leaves', top:[52,100,28],   side:[52,100,28],   bot:[52,100,28],   solid:true,  opaque:false, hardness:0.4 },
  6:  { name:'Sand',   top:[214,198,128], side:[214,198,128], bot:[214,198,128], solid:true,  opaque:true,  hardness:0.8 },
  7:  { name:'Water',  top:[42,100,200],  side:[42,100,200],  bot:[42,100,200],  solid:false, opaque:false, alpha:0.70,   hardness:99 },
  8:  { name:'Gravel', top:[148,140,130], side:[148,140,130], bot:[148,140,130], solid:true,  opaque:true,  hardness:0.8 },
  9:  { name:'Cobble', top:[112,108,104], side:[112,108,104], bot:[112,108,104], solid:true,  opaque:true,  hardness:2.0 },
  10: { name:'Torch',  top:[220,180,60],  side:[220,180,60],  bot:[220,180,60],  solid:false, opaque:false, hardness:0.1, light:true  },
};

// Block IDs available in the player's hotbar
export const PLACE_IDS = [1, 2, 3, 4, 5, 6, 8, 9];
