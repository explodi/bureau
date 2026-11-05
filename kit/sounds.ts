/**
 * The kit's controls make a sound when they answer. What sound is the game's:
 * it hands the kit a player, and without one the controls are silent.
 */
export type KitSound = "select" | "click" | "open" | "cancel" | "deny";

let player: (sound: KitSound) => void = () => {};

export function setKitSoundPlayer(play: (sound: KitSound) => void): void {
  player = play;
}

export function playKitSound(sound: KitSound): void {
  player(sound);
}
