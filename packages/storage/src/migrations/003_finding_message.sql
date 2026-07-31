-- Why a finding was raised, kept alongside the criterion id it points at.
--
-- The code checks already produced this text and the gate discarded it, so a
-- rejected submission printed a rule name with no reason. Storing it rather
-- than only printing it means `history` can explain an old round too; rounds
-- recorded before this migration keep a NULL and still render, just without
-- the explanation, since the reason was never captured for them.

ALTER TABLE findings ADD COLUMN message TEXT;
