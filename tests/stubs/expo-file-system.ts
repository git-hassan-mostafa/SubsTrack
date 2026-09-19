// The CSV writer imports this at module load. Tests assert the TEXT a table
// becomes, never the file it lands in, so nothing here touches a disk.
export class File {
  constructor(..._args: unknown[]) {}
  create(): void {}
  write(): void {}
  get uri(): string {
    return "file://export.csv";
  }
}

export class Directory {
  constructor(..._args: unknown[]) {}
  get exists(): boolean {
    return true;
  }
  create(): void {}
}

export const Paths = { cache: "file://cache" };

export default { File, Directory, Paths };
