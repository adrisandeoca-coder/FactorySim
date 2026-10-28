/**
 * electron-builder afterPack hook (Windows only).
 *
 * Writes the FactorySim icon and version information into FactorySim.exe
 * using resedit (pure JavaScript). electron-builder normally does this with
 * rcedit.exe, which needs Wine on Linux/macOS; with
 * `win.signAndEditExecutable: false` this hook takes over, so the Windows
 * installer builds identically on any OS.
 */
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { NtExecutable, NtExecutableResource, Resource, Data } = await import('resedit');
  const { productFilename } = context.packager.appInfo;
  const version = context.packager.appInfo.version;
  const exePath = path.join(context.appOutDir, `${productFilename}.exe`);
  const iconPath = path.join(context.packager.projectDir, 'resources', 'icon.ico');

  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  // Icon: replace Electron's default icon group (id 1)
  const iconFile = Data.IconFile.from(fs.readFileSync(iconPath));
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, 1, 1033, iconFile.icons.map((i) => i.data),
  );

  // Version info shown in Explorer > Properties > Details and Task Manager
  const [major, minor, patch] = version.split('.').map((n) => parseInt(n, 10) || 0);
  const vi = Resource.VersionInfo.fromEntries(res.entries)[0] || Resource.VersionInfo.createEmpty();
  vi.setFileVersion(major, minor, patch, 0, 1033);
  vi.setProductVersion(major, minor, patch, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    ProductName: 'FactorySim',
    FileDescription: 'FactorySim — discrete event simulation for manufacturing',
    CompanyName: 'FactorySim',
    LegalCopyright: `Copyright © ${new Date().getFullYear()} FactorySim contributors`,
    OriginalFilename: `${productFilename}.exe`,
    InternalName: 'FactorySim',
    ProductVersion: version,
    FileVersion: version,
  });
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log(`  • after-pack: set icon and version ${version} on ${path.basename(exePath)}`);
};
