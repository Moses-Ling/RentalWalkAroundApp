import { describe, it, expect } from "vitest";
import { conditionTrend, diffInspections, CInspection } from "@/lib/compare";

const item = (id: string, o: Partial<CInspection["rooms"][0]["items"][0]> = {}) => ({
  id, name: id, isEquipment: false, condition: "GOOD", workingOrder: null, notes: "", changeStatus: null, priorItemId: null, ...o,
});

describe("conditionTrend", () => {
  it("ranks conditions", () => {
    expect(conditionTrend("GOOD", "POOR")).toBe("WORSE");
    expect(conditionTrend("FAIR", "EXCELLENT")).toBe("BETTER");
    expect(conditionTrend("GOOD", "GOOD")).toBe("SAME");
    expect(conditionTrend(null, "GOOD")).toBe("UNKNOWN");
  });
});

describe("diffInspections", () => {
  const moveIn: CInspection = {
    rooms: [{
      id: "r1", name: "Kitchen", condition: "GOOD",
      items: [item("i-wall"), item("i-fridge", { isEquipment: true, workingOrder: "WORKING" }), item("i-floor")],
      blemishes: [{ id: "b-old", description: "scratch", status: "OPEN", priorBlemishId: null, itemId: "i-wall" }],
    }],
  };
  const moveOut: CInspection = {
    rooms: [{
      id: "r2", name: "Kitchen", condition: "FAIR",
      items: [
        item("o-wall", { priorItemId: "i-wall" }),
        item("o-fridge", { isEquipment: true, workingOrder: "NOT_WORKING", priorItemId: "i-fridge" }),
        item("o-floor", { priorItemId: "i-floor", condition: "POOR" }),
        item("o-new"),
      ],
      blemishes: [
        { id: "b-carry", description: "scratch", status: "OPEN", priorBlemishId: "b-old", itemId: "o-wall" },
        { id: "b-new", description: "burn mark", status: "OPEN", priorBlemishId: null, itemId: "o-floor" },
      ],
    }],
  };

  const { rooms, summary } = diffInspections(moveIn, moveOut);
  const k = rooms[0];

  it("detects room trend and flags", () => {
    expect(k.trend).toBe("WORSE");
    expect(k.flagged).toBe(true);
  });

  it("detects item condition and working-order changes", () => {
    expect(k.items.find((i) => i.name === "o-floor")).toMatchObject({ trend: "WORSE", flagged: true });
    expect(k.items.find((i) => i.name === "o-fridge")).toMatchObject({ workingOrderChanged: true, flagged: true });
    expect(k.items.find((i) => i.name === "o-wall")!.flagged).toBe(false);
  });

  it("flags items added since move-in", () => {
    expect(k.items.find((i) => i.name === "o-new")).toMatchObject({ before: null, flagged: true });
  });

  it("separates new, existing and repaired blemishes", () => {
    expect(k.newBlemishes.map((b) => b.id)).toEqual(["b-new"]);
    expect(k.existingBlemishes.map((b) => b.id)).toEqual(["b-carry"]);
    expect(k.repairedBlemishes).toHaveLength(0);
  });

  it("summarizes", () => {
    expect(summary).toEqual({ roomsFlagged: 1, itemsWorse: 1, workingOrderChanges: 1, newBlemishes: 1, repairedBlemishes: 0 });
  });

  it("honors inspector-marked change status and repaired blemishes", () => {
    const out2: CInspection = {
      rooms: [{
        id: "r2", name: "Kitchen", condition: "GOOD",
        items: [item("o-wall", { priorItemId: "i-wall", changeStatus: "REPAIRED" })],
        blemishes: [{ id: "b-carry", description: "scratch", status: "REPAIRED", priorBlemishId: "b-old", itemId: "o-wall" }],
      }],
    };
    const d = diffInspections(moveIn, out2);
    expect(d.rooms[0].items[0].flagged).toBe(true);
    expect(d.summary.repairedBlemishes).toBe(1);
  });
});
