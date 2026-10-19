export type CBlemish = { id: string; description: string; status: "OPEN" | "REPAIRED"; priorBlemishId: string | null; itemId: string | null };
export type CItem = {
  id: string; name: string; isEquipment: boolean; condition: string | null; workingOrder: string | null;
  notes: string; changeStatus: string | null; priorItemId: string | null;
};
export type CRoom = { id: string; name: string; condition: string | null; items: CItem[]; blemishes: CBlemish[] };
export type CInspection = { rooms: CRoom[] };

const RANK: Record<string, number> = { EXCELLENT: 4, GOOD: 3, FAIR: 2, POOR: 1, DAMAGED: 0 };

export type ConditionTrend = "WORSE" | "BETTER" | "SAME" | "UNKNOWN";

export function conditionTrend(before: string | null, after: string | null): ConditionTrend {
  if (!before || !after) return "UNKNOWN";
  const d = RANK[after] - RANK[before];
  return d < 0 ? "WORSE" : d > 0 ? "BETTER" : "SAME";
}

export type ItemDiff = {
  name: string;
  isEquipment: boolean;
  before: { condition: string | null; workingOrder: string | null; notes: string } | null;
  after: { condition: string | null; workingOrder: string | null; notes: string };
  trend: ConditionTrend;
  workingOrderChanged: boolean;
  changeStatus: string | null;
  /** True if anything differs, an inspector marked it, or a blemish is new/repaired. */
  flagged: boolean;
};
export type RoomDiff = {
  name: string;
  before: string | null;
  after: string | null;
  trend: ConditionTrend;
  items: ItemDiff[];
  newBlemishes: CBlemish[];
  repairedBlemishes: CBlemish[];
  existingBlemishes: CBlemish[];
  flagged: boolean;
};

export function diffInspections(moveIn: CInspection, moveOut: CInspection): { rooms: RoomDiff[]; summary: Summary } {
  const rooms: RoomDiff[] = moveOut.rooms.map((out) => {
    const inn = moveIn.rooms.find((r) => r.name === out.name);
    const byId = new Map((inn?.items ?? []).map((i) => [i.id, i]));

    const items: ItemDiff[] = out.items.map((it) => {
      const prior = it.priorItemId ? byId.get(it.priorItemId) : undefined;
      const trend = prior ? conditionTrend(prior.condition, it.condition) : "UNKNOWN";
      const workingOrderChanged = !!prior && prior.workingOrder !== it.workingOrder;
      const hasNew = out.blemishes.some((b) => b.itemId === it.id && !b.priorBlemishId);
      const hasRepaired = out.blemishes.some((b) => b.itemId === it.id && b.status === "REPAIRED");
      const marked = !!it.changeStatus && it.changeStatus !== "UNCHANGED";
      return {
        name: it.name,
        isEquipment: it.isEquipment,
        before: prior ? { condition: prior.condition, workingOrder: prior.workingOrder, notes: prior.notes } : null,
        after: { condition: it.condition, workingOrder: it.workingOrder, notes: it.notes },
        trend,
        workingOrderChanged,
        changeStatus: it.changeStatus,
        flagged: !prior || trend === "WORSE" || trend === "BETTER" || workingOrderChanged || hasNew || hasRepaired || marked,
      };
    });

    const newBlemishes = out.blemishes.filter((b) => !b.priorBlemishId);
    const repairedBlemishes = out.blemishes.filter((b) => b.priorBlemishId && b.status === "REPAIRED");
    const existingBlemishes = out.blemishes.filter((b) => b.priorBlemishId && b.status === "OPEN");
    const trend = conditionTrend(inn?.condition ?? null, out.condition);
    return {
      name: out.name,
      before: inn?.condition ?? null,
      after: out.condition,
      trend,
      items,
      newBlemishes,
      repairedBlemishes,
      existingBlemishes,
      flagged: trend === "WORSE" || newBlemishes.length > 0 || repairedBlemishes.length > 0 || items.some((i) => i.flagged),
    };
  });

  return { rooms, summary: summarize(rooms) };
}

export type Summary = {
  roomsFlagged: number;
  itemsWorse: number;
  workingOrderChanges: number;
  newBlemishes: number;
  repairedBlemishes: number;
};

function summarize(rooms: RoomDiff[]): Summary {
  return {
    roomsFlagged: rooms.filter((r) => r.flagged).length,
    itemsWorse: rooms.reduce((n, r) => n + r.items.filter((i) => i.trend === "WORSE").length, 0),
    workingOrderChanges: rooms.reduce((n, r) => n + r.items.filter((i) => i.workingOrderChanged).length, 0),
    newBlemishes: rooms.reduce((n, r) => n + r.newBlemishes.length, 0),
    repairedBlemishes: rooms.reduce((n, r) => n + r.repairedBlemishes.length, 0),
  };
}
