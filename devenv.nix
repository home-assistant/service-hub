{ pkgs, ... }:

{
  cachix.enable = false;

  packages = with pkgs; [
    git
    just
  ];

  languages.javascript = {
    enable = true;
    pnpm.enable = true;
  };
}
