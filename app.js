const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
  res.render('splash');
});

app.get('/timer', (req, res) => {
  res.render('index');
});

app.get('/speakers', (req, res) => {
  res.render('speakers');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});