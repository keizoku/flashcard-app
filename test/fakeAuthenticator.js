import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";

// テスト用の、偽物のパスキーの端末（iPhone の Face ID などの代わり）。
// 本物と同じ形の答え（WebAuthn の JSON）を作り、本物と同じように署名する。
// 公開鍵の形（COSE）と登録の答え（attestationObject）は CBOR という形で書くので、そのための小さな書き出しも持つ

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256 = (data) => createHash("sha256").update(data).digest();

// ---- CBOR（必要な分だけ: 整数・バイト列・文字列・マップ） ----
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  const b = Buffer.alloc(3);
  b[0] = (major << 5) | 25;
  b.writeUInt16BE(n, 1);
  return b;
}
function cbor(value) {
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === "string") {
    const b = Buffer.from(value, "utf8");
    return Buffer.concat([head(3, b.length), b]);
  }
  if (value instanceof Map) {
    const parts = [head(5, value.size)];
    for (const [k, v] of value) parts.push(cbor(k), cbor(v));
    return Buffer.concat(parts);
  }
  throw new Error("この形は書けません");
}

// origin: 答えを返すページ（http://localhost:3000 など）。rpID: そのドメイン（localhost など）
export function createFakeAuthenticator({ origin = "http://localhost:3000", rpID = "localhost" } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const credentialId = randomBytes(16);
  let counter = 0;
  let userHandle = null;

  const coseKey = cbor(
    new Map([
      [1, 2], // kty: EC2
      [3, -7], // alg: ES256
      [-1, 1], // crv: P-256
      [-2, Buffer.from(jwk.x, "base64url")],
      [-3, Buffer.from(jwk.y, "base64url")],
    ])
  );
  const flags = (attested) => 0x01 | 0x04 | (attested ? 0x40 : 0); // UP（触れた）・UV（本人確認した）・AT（鍵つき）
  const counterBytes = () => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(counter);
    return b;
  };
  const clientData = (type, challenge, o = origin) =>
    Buffer.from(JSON.stringify({ type, challenge, origin: o, crossOrigin: false }));

  return {
    id: b64url(credentialId),

    // 登録の答え（navigator.credentials.create の結果）。options は サーバーが出した登録の options
    register(options, { origin: o = origin, rpID: r = rpID } = {}) {
      userHandle = options.user?.id ?? null;
      const authData = Buffer.concat([
        sha256(r),
        Buffer.from([flags(true)]),
        counterBytes(),
        Buffer.alloc(16), // aaguid（なし）
        Buffer.from([0, credentialId.length]),
        credentialId,
        coseKey,
      ]);
      const attestationObject = cbor(
        new Map([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ])
      );
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        response: {
          clientDataJSON: b64url(clientData("webauthn.create", options.challenge, o)),
          attestationObject: b64url(attestationObject),
          transports: ["internal"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },

    // ログインの答え（navigator.credentials.get の結果）。使うたびに回数を1つ増やす
    login(options, { origin: o = origin, rpID: r = rpID, counter: forced } = {}) {
      counter = forced ?? counter + 1;
      const authData = Buffer.concat([sha256(r), Buffer.from([flags(false)]), counterBytes()]);
      const cd = clientData("webauthn.get", options.challenge, o);
      const signature = sign("sha256", Buffer.concat([authData, sha256(cd)]), privateKey);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        response: {
          clientDataJSON: b64url(cd),
          authenticatorData: b64url(authData),
          signature: b64url(signature),
          ...(userHandle ? { userHandle } : {}),
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
}
