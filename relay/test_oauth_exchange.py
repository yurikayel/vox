import io
import json
import unittest
import urllib.parse

from relay import oauth_exchange as ox

ENV = {"VOX_OAUTH_TWITTER_CLIENT_ID": "cid", "VOX_OAUTH_TWITTER_CLIENT_SECRET": "sec",
       "VOX_OAUTH_GITHUB_CLIENT_ID": "gid", "VOX_OAUTH_GITHUB_CLIENT_SECRET": "gsec"}


class FakeResp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_opener(token_body, me_body, seen):
    def opener(req, timeout=0):
        seen.append(req)
        body = token_body if req.get_method() == "POST" else me_body
        return FakeResp(json.dumps(body).encode())
    return opener


class OAuthExchangeTest(unittest.TestCase):
    def payload(self, provider="twitter"):
        return {"provider": provider, "code": "abc", "code_verifier": "v", "redirect_uri": "https://vox.test/oauth-callback.html"}

    def test_twitter_returns_handle_and_discards_token(self):
        seen = []
        out = ox.exchange(self.payload(), ENV, fake_opener({"access_token": "TKN"}, {"data": {"id": "1", "username": "yurix", "name": "Yuri"}}, seen))
        self.assertEqual(out, {"provider": "twitter", "handle": "yurix", "id": "1", "name": "Yuri"})
        self.assertNotIn("TKN", json.dumps(out))
        token_req = seen[0]
        self.assertTrue(token_req.get_header("Authorization").startswith("Basic "))
        form = urllib.parse.parse_qs(token_req.data.decode())
        self.assertEqual(form["code_verifier"], ["v"])
        self.assertNotIn("client_secret", form)

    def test_github_sends_secret_in_body(self):
        seen = []
        out = ox.exchange(self.payload("github"), ENV, fake_opener({"access_token": "T"}, {"login": "yk", "id": 7}, seen))
        self.assertEqual(out["handle"], "yk")
        self.assertEqual(urllib.parse.parse_qs(seen[0].data.decode())["client_secret"], ["gsec"])

    def test_unconfigured_provider_is_501(self):
        with self.assertRaises(ox.OAuthError) as ctx:
            ox.exchange(self.payload("tiktok"), ENV, fake_opener({}, {}, []))
        self.assertEqual(ctx.exception.status, 501)

    def test_rejects_unknown_provider_and_missing_code(self):
        with self.assertRaises(ox.OAuthError):
            ox.exchange({"provider": "orkut", "code": "x", "redirect_uri": "y"}, ENV)
        with self.assertRaises(ox.OAuthError):
            ox.exchange({"provider": "twitter", "redirect_uri": "y"}, ENV)

    def test_refused_code_is_502(self):
        with self.assertRaises(ox.OAuthError) as ctx:
            ox.exchange(self.payload(), ENV, fake_opener({"error": "invalid_grant"}, {}, []))
        self.assertEqual(ctx.exception.status, 502)

    def test_parse_identity_variants(self):
        self.assertEqual(ox.parse_identity("tiktok", {"data": {"user": {"username": "tt", "open_id": "o"}}})["handle"], "tt")
        self.assertEqual(ox.parse_identity("instagram", {"username": "ig", "id": 3})["id"], "3")


if __name__ == "__main__":
    unittest.main()
