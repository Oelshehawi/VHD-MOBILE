export const ASSIGNED_TO_USER_CLAUSE = `
  json_valid(assignedTechnicians)
  AND EXISTS (
    SELECT 1 FROM json_each(assignedTechnicians) WHERE value = ?
  )
`;
