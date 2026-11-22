import { actor, UserError } from "rivetkit";

export type GameSave = {
  x: number;
  y: number;
  cash: number;
  bank: number;
  missionIndex: number;
  active: boolean;
  missionStage: number;
  character: number;
  heat: number;
  health: number;
  snacks: number;
  smoke: number;
  owns