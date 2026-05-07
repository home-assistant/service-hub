{ pkgs, ... }:

{
  cachix.enable = false;

  packages = with pkgs; [
    git
  ];

  languages.javascript = {
    enable = true;
    bun.enable = true;
  };
}
