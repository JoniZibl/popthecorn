/**
 * Figmas SVG-Import verschachtelt Gruppen tief — pro <g> im Quell-SVG eine,
 * auch wenn sie nur ein einziges Kind enthaelt. Die loesen wir auf, damit der
 * Layer-Baum im Ebenen-Panel benutzbar bleibt.
 *
 * Gruppen mit Maske, Transparenz oder eigenem Blend-Modus bleiben erhalten:
 * dort traegt die Gruppe selbst Bildinformation.
 */
export function unwrapRedundantGroups(root: FrameNode, maxPasses = 12): void {
  for (let pass = 0; pass < maxPasses; pass++) {
    if (!unwrapOnce(root)) return;
  }
}

function unwrapOnce(root: FrameNode): boolean {
  const groups = root.findAll((node) => node.type === "GROUP") as GroupNode[];
  let changed = false;

  for (const group of groups) {
    if (group.removed) continue;
    if (group.children.length !== 1) continue;
    if (!isTransparentWrapper(group)) continue;

    const parent = group.parent;
    if (!parent || !("insertChild" in parent)) continue;

    try {
      const index = parent.children.indexOf(group);
      // insertChild verschiebt das Kind; die dann leere Gruppe raeumt Figma
      // selbst ab — deshalb erst danach auf `removed` pruefen.
      parent.insertChild(index, group.children[0]);
      if (!group.removed) group.remove();
      changed = true;
    } catch (error) {
      console.warn("Gruppe konnte nicht aufgeloest werden", error);
    }
  }

  return changed;
}

function isTransparentWrapper(group: GroupNode): boolean {
  return (
    group.opacity === 1 &&
    group.blendMode === "PASS_THROUGH" &&
    group.visible &&
    !group.isMask &&
    group.effects.length === 0
  );
}
