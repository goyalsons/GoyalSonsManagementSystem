-- Prevent any DELETE or UPDATE on RolePolicy rows that belong to the Director role.
-- Director role policies are immutable (enforced at app layer and DB layer).

CREATE OR REPLACE FUNCTION prevent_director_role_policy_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  role_name text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT r.name INTO role_name FROM "Role" r WHERE r.id = OLD."roleId";
  ELSE
    SELECT r.name INTO role_name FROM "Role" r WHERE r.id = NEW."roleId";
  END IF;

  IF role_name = 'Director' THEN
    RAISE EXCEPTION 'Director role policies are immutable and cannot be modified or deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER role_policy_protect_director
  BEFORE UPDATE OR DELETE ON "RolePolicy"
  FOR EACH ROW
  EXECUTE PROCEDURE prevent_director_role_policy_changes();
