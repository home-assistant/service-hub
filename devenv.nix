{ pkgs, ... }:

{
  cachix.enable = false;

  packages = with pkgs; [
    git
    just
  ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_26;
    pnpm.enable = true;
  };
}
