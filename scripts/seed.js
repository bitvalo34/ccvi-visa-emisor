// scripts/seed.js
import { pool } from '../src/db.js';

const SQL = `
CREATE TABLE IF NOT EXISTS credit_cards (
  id SERIAL PRIMARY KEY,
  card_number VARCHAR(19) NOT NULL,
  holder_name TEXT NOT NULL,
  brand TEXT NOT NULL DEFAULT 'VISA',
  expiry_month INT NOT NULL,
  expiry_year INT NOT NULL,
  cvv VARCHAR(4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO credit_cards
  (card_number, holder_name, expiry_month, expiry_year, cvv)
VALUES
  ('4111111111111111', 'ALICE TEST', 12, 2028, '123'),
  ('4012888888881881', 'BOB TEST',    7, 2027, '456')
ON CONFLICT DO NOTHING;
`;

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');
    console.log('✅ Seed OK');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Seed error', e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
