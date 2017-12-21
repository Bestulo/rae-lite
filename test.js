const Rae = require('../rae')
const rae = new Rae()

rae.create()
	.search('casa')
	.then(console.log)