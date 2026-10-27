/** Keep the UI's recipient preview and the room router on the same rule. */
export function groupHostId(members: readonly string[], primaryId?: string, previousId?: string): string {
  if (previousId) return members.includes(previousId) ? previousId : members[0] || '';
  return primaryId && members.includes(primaryId) ? primaryId : members[0] || '';
}
