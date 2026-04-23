DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'journal_line_one_side_chk'
  ) THEN
    ALTER TABLE "JournalLine"
      ADD CONSTRAINT journal_line_one_side_chk
      CHECK (
        (("debitPaise" = 0 AND "creditPaise" > 0) OR ("creditPaise" = 0 AND "debitPaise" > 0))
        AND "debitPaise" >= 0 AND "creditPaise" >= 0
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION journal_entry_validate_balance() RETURNS trigger AS $$
DECLARE
  total_debit bigint;
  total_credit bigint;
BEGIN
  IF NEW."status" = 'POSTED' THEN
    SELECT COALESCE(SUM("debitPaise"), 0), COALESCE(SUM("creditPaise"), 0)
    INTO total_debit, total_credit
    FROM "JournalLine"
    WHERE "journalEntryId" = NEW."id";

    IF total_debit <> total_credit THEN
      RAISE EXCEPTION 'Journal entry % is not balanced (debit %, credit %)', NEW."id", total_debit, total_credit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_entry_validate_balance_insert ON "JournalEntry";
CREATE TRIGGER trg_journal_entry_validate_balance_insert
BEFORE INSERT ON "JournalEntry"
FOR EACH ROW
EXECUTE FUNCTION journal_entry_validate_balance();

DROP TRIGGER IF EXISTS trg_journal_entry_validate_balance_update ON "JournalEntry";
CREATE TRIGGER trg_journal_entry_validate_balance_update
BEFORE UPDATE OF "status" ON "JournalEntry"
FOR EACH ROW
EXECUTE FUNCTION journal_entry_validate_balance();

