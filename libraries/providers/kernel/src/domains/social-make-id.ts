import crypto from 'crypto';

export const makeId = (length: number) => {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
};
