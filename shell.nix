{
  sources ? import ./sources.nix,
  nixpkgs ? sources.nixpkgs,
  niv ? sources.niv,
  mkCli ? sources.mkCli,
  rust-overlay ? sources.rust-overlay,
}: let
  niv-overlay = self: _: {
    niv = self.symlinkJoin {
      name = "niv";
      paths = [niv];
      buildInputs = [self.makeWrapper];
      postBuild = ''
        wrapProgram $out/bin/niv \
          --add-flags "--sources-file ${toString ./sources.json}"
      '';
    };
  };

  mkCli-overlay = import "${mkCli}/overlay.nix";

  pkgs = import nixpkgs {
    overlays = [
      niv-overlay
      mkCli-overlay
      (import rust-overlay)
    ];
    config = {};
  };

  cli = pkgs.lib.mkCli "cli" {
    _noAll = true;

    install = "${pkgs.nodejs}/bin/npm ci";

    start = "${pkgs.nodejs}/bin/npm run -w staking build && ${pkgs.nodejs}/bin/npm run -w frontend dev";

    test = {
      nix = {
        lint = "${pkgs.statix}/bin/statix check --ignore node_modules .";
        dead-code = "${pkgs.deadnix}/bin/deadnix --exclude ./node_modules .";
        format = "${pkgs.alejandra}/bin/alejandra --exclude ./node_modules --check .";
      };
      frontend = {
        lint = "${pkgs.nodejs}/bin/npm run -w frontend test:lint";
        format = "${pkgs.nodejs}/bin/npm run -w frontend test:format";
      };
    };

    fix = {
      nix = {
        lint = "${pkgs.statix}/bin/statix fix --ignore node_modules .";
        dead-code = "${pkgs.deadnix}/bin/deadnix --exclude ./node_modules -e .";
        format = "${pkgs.alejandra}/bin/alejandra --exclude ./node_modules .";
      };
      frontend = {
        lint = "${pkgs.nodejs}/bin/npm run -w frontend fix:lint";
        format = "${pkgs.nodejs}/bin/npm run -w frontend fix:format";
      };
    };
  };
in
  pkgs.mkShell {
    FORCE_COLOR = 1;
    nativeBuildInputs = [pkgs.pkg-config];
    buildInputs = [
      cli
      pkgs.git
      pkgs.niv
      pkgs.nodejs
      pkgs.python3
      pkgs.systemd
      (
        pkgs.rust-bin.stable.latest.default.override {
          extensions = ["rust-std"];
          targets = ["wasm32-unknown-unknown"];
        }
      )
    ];
  }
