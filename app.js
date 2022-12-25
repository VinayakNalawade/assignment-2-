const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

app.use(express.json());

let db;

//initialize
let initialize = async () => {
  let dbPath = path.join(__dirname, "twitterClone.db");

  db = await open({ filename: dbPath, driver: sqlite3.Database });

  app.listen(3000, () => console.log("Server is Online"));
};

initialize();

//Authorization
function authorization(request, response, next) {
  const auth = request.headers["authorization"];

  if (auth === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const token = auth.split(" ")[1];

    jwt.verify(token, "secret", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
}

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const data = await db.get(
    `SELECT * FROM user WHERE username = '${username}'`
  );

  if (data === undefined) {
    if (password.length > 5) {
      let newpass = await bcrypt.hash(password, 10);

      let query = `INSERT INTO user (username,password,name,gender) 
        VALUES ( '${username}', '${newpass}', '${name}', '${gender}' );`;

      await db.run(query);

      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const data = await db.get(
    `SELECT * FROM user WHERE username = '${username}'`
  );

  if (data !== undefined) {
    if (await bcrypt.compare(password, data.password)) {
      let payload = { username: username };
      let jwtToken = jwt.sign(payload, "secret");

      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//API 3
app.get("/user/tweets/feed/", authorization, async (request, response) => {
  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );

  let query = `SELECT username,tweet ,date_time AS dateTime 
    FROM (follower join tweet ON follower.following_user_id = tweet.user_id) NATURAL JOIN user  
    WHERE follower.follower_user_id = ${user_id}
    ORDER BY date_time DESC
    LIMIT 4 ;`;

  let result = await db.all(query);

  response.send(result);
});

//API 4
app.get("/user/following/", authorization, async (request, response) => {
  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );

  let query = `SELECT DISTINCT name
    FROM follower join user ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${user_id}`;

  let result = await db.all(query);

  response.send(result);
});

//API 5
app.get("/user/followers/", authorization, async (request, response) => {
  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );

  let query = `SELECT DISTINCT name
    FROM follower join user ON follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${user_id}`;

  let result = await db.all(query);

  response.send(result);
});

//API 6
app.get("/tweets/:tweetId", authorization, async (request, response) => {
  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );
  const { tweetId } = request.params;

  const query = `SELECT tweet, 
  (SELECT COUNT() FROM like WHERE tweet_id = ${tweetId} ) AS likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = ${tweetId} ) AS replies,
  date_time AS dateTime 
  FROM tweet 
  WHERE tweet_id = ${tweetId} AND 
  user_id IN (SELECT follower_user_id FROM follower WHERE following_user_id = ${user_id}) ;`;

  let result = await db.get(query);

  if (result === undefined) {
    response.status(401);
    response.send("Invalid Request");
  }

  response.send(result);
});

//API 7
app.get("/tweets/:tweetId/likes", authorization, async (request, response) => {
  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );

  const { tweetId } = request.params;

  let query = `SELECT following_user_id AS user FROM follower JOIN tweet ON follower.following_user_id = tweet.tweet_id
    WHERE follower.follower_user_id = ${user_id} AND tweet.tweet_id = ${tweetId} ;`;

  let user = await db.get(query);

  if (user === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    let query = `SELECT username FROM like NATURAL JOIN user WHERE tweet_id= ${tweetId} ;`;

    let result = await db.all(query);

    response.send({ likes: result.map((item) => item.username) });
  }
});

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authorization,
  async (request, response) => {
    let { user_id } = await db.get(
      `SELECT * FROM user WHERE username = '${request.username}';`
    );

    const { tweetId } = request.params;

    let query = `SELECT following_user_id AS user FROM follower JOIN tweet ON follower.following_user_id = tweet.tweet_id
    WHERE follower.follower_user_id = ${user_id} AND tweet.tweet_id = ${tweetId} ;`;

    let user = await db.get(query);

    if (user === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      let query = `SELECT name,reply FROM reply NATURAL JOIN user WHERE tweet_id= ${tweetId} ;`;

      let result = await db.all(query);

      response.send({ replies: result });
    }
  }
);

//API 9
app.get("/user/tweets/", authorization, async (request, response) => {
  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );

  let query = `SELECT tweet_id FROM tweet
    WHERE user_id = ${user_id}
    ;`;

  let tweets = await db.all(query);

  let tweet_ids = tweets.map((item) => item.tweet_id);

  let result = [];

  for (let item of tweet_ids) {
    let query = `SELECT tweet, 
  (SELECT COUNT() FROM like WHERE tweet_id = ${item} ) AS likes,
  (SELECT COUNT() FROM reply WHERE tweet_id = ${item} ) AS replies,
  date_time AS dateTime 
  FROM tweet 
  WHERE tweet_id = ${item} ;`;

    result.push(await db.get(query));
  }

  response.send(result);
});

//API 10
app.post("/user/tweets/", authorization, async (request, response) => {
  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );

  const { tweet } = request.body;

  let query = `INSERT INTO tweet 
    (tweet,user_id, date_time) 
    VALUES ('${tweet}', ${user_id}, "${new Date()}");`;

  let result = await db.run(query);

  response.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", authorization, async (request, response) => {
  let { tweetId } = request.params;

  let { user_id } = await db.get(
    `SELECT * FROM user WHERE username = '${request.username}';`
  );

  let query = `DELETE FROM tweet WHERE tweet_id = ${tweetId} AND user_id = ${user_id};`;

  let result = await db.run(query);

  if (result.changes === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send("Tweet Removed");
  }
});

//module exports
module.exports = app;

/* `SELECT tweet, tweet.tweet_id,COUNT(like_id) AS likes, COUNT(reply_id) AS replies, date_time AS dateTime 
    FROM (like JOIN reply ON like.tweet_id = reply.tweet_id) AS T
    JOIN tweet ON T.tweet_id = tweet.tweet_id
    WHERE tweet.user_id = ${user_id}
    GROUP BY tweet.tweet_id;`; */
