const DISCRIMINANT_SIZE = 8;
const POSITION_SIZE = 104;
const MAX_POSITIONS = 100;
const PUBKEY = 32;

export const positions_account_size =
  POSITION_SIZE * MAX_POSITIONS + DISCRIMINANT_SIZE + PUBKEY;