# Dependencias nativas de Wails en NixOS: `nix-shell` y luego `wails dev` / `wails build -tags webkit2_41`.
{ pkgs ? import <nixpkgs> { } }:
pkgs.mkShell {
  nativeBuildInputs = with pkgs; [ pkg-config go nodejs ];
  buildInputs = with pkgs; [ gtk3 webkitgtk_4_1 libsoup_3 glib-networking ];
  shellHook = ''
    export GIO_MODULE_DIR=${pkgs.glib-networking}/lib/gio/modules/
  '';
}
