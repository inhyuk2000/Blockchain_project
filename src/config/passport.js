import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL, 
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value ?? null;
        const name = profile.displayName ?? "";

        // TODO: DB 조회 필요

        const existingUser = null; // dummy data

        if (existingUser) {
          return done(null, {
            id: existingUser.id,
            email: existingUser.email,
            isNewUser: false,
          });
        }

        // 신규 유저라면 signup 페이지로 넘기기 위한 임시 정보
        return done(null, {
          googleId,
          email,
          name,
          isNewUser: true,
        });
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

export default passport;