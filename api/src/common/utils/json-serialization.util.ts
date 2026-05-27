/**
 * JSON.stringify cannot serialize BigInt (e.g. PullRequest.githubId from Prisma).
 * Install once at process startup so Express/Nest responses succeed.
 */
export function installJsonBigIntSupport(): void {
  const proto = BigInt.prototype as bigint & { toJSON?: () => string };
  if (proto.toJSON) {
    return;
  }

  Object.defineProperty(BigInt.prototype, 'toJSON', {
    value: function (this: bigint) {
      return this.toString();
    },
    writable: true,
    configurable: true,
  });
}
