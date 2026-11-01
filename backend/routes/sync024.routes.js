'use strict';
function create(pool,plan){
 const router=require('express').Router(),controller=require('../controllers/sync024.controller').create(pool,plan);
 router.get('/estado',controller.status);
 router.get('/comandos/:clave',controller.recover);
 router.post('/:provider/:action',controller.control);
 return router;
}
module.exports={create};
