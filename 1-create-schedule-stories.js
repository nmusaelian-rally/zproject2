var q = require('q');
var _ = require('lodash');

var rally = null;
var workspaceRef = '/workspace/123'; 
var userOids = ['666','777','888']; 
var scheduledStories = [];
var today = new Date().toISOString();

createRally();
getCurrentTimeboxes()
    .then(createStories)
    .then(createTasks)
    .then(findStoriesInCurrentIteration)
    .then(updateStories)
    .then(findEpicsLinkedToFeaturesInCurrentRelease)
    .then(setParent)
    .then(onSuccess)
    .fail(onError);

    

function getCurrentTimeboxes(){
    var timeboxes = [];
    timeboxes.push(getCurrentIteration());
    timeboxes.push(getCurrentRelease());
    return q.all(timeboxes);
}


function createRally(){
    rally = require('rally'),
    queryUtils = rally.util.query,
    rallyApi = rally({
        apiKey: '_abc123', 
        server: 'https://rally1.rallydev.com',  
        requestOptions: {
            headers: {
                'X-RallyIntegrationName': 'Nick\'s node.js program',  
                'X-RallyIntegrationVendor': 'Rally Labs',             
                'X-RallyIntegrationVersion': '1.0'                    
            }
        }
    });
}

function getCurrentRelease(){
    return rallyApi.query({
        type: 'release',
        limit: Infinity,
        fetch: ['Name','ObjectID','Project','ReleaseStartDate','ReleaseDate'],
        query: (queryUtils.where('ReleaseStartDate', '<=', today)).and('ReleaseDate', '>=', today),
        scope: {
            workspace: workspaceRef
        },
        requestOptions: {}
    });
}

function getCurrentIteration(){
    return rallyApi.query({
        type: 'iteration',
        limit: Infinity,
        fetch: ['Name','ObjectID','Project','StartDate','EndDate'],
        query: (queryUtils.where('StartDate', '<=', today)).and('EndDate', '>=', today),
        scope: {
            workspace: workspaceRef
        },
        requestOptions: {}
    });
}

function createStories(result){
    var stories = [];
    var iterations = result[0];
    var releases = result[1];
    var numOfStoriesInIteration = randomInt (10, 12); 
    if (iterations.Results.length > 0) {
        console.log("found ",iterations.Results.length, "current iterations");
        console.log("found ",releases.Results.length, "current releases");
            for(var i=0;i<iterations.Results.length;i++){
                for(var n=0;n<numOfStoriesInIteration;n++){
                    var project = iterations.Results[i].Project;
                    stories.push(rallyApi.create({
                        type: 'hierarchicalrequirement',
                        data: {
                            Name: 'Story ' + i + ':' + n + ' in ' + project._refObjectName,
                            Release: releases.Results[i]._ref,
                            Iteration: iterations.Results[i]._ref
                            //Owner: setOwner()
                        },
                        fetch: ['ObjectID','FormattedID','Release','Project','TaskEstimateTotal','PlanEstimate'],  
                        scope: {
                            project: project._ref
                        }
                    }));
                }
        }
        return q.all(stories);
    }
    else{
        return "no iterations"
    }
}

function createTasks(stories){
    var tasks = [];
    var data = [];
    for(var i=0;i<stories.length;i++){
        var numOfTasksPerStory = randomInt(3, 6);
        for(var n=0; n<numOfTasksPerStory;n++){
            data.push({
               Name: 'Task ' + n + ':' + i + ' of ' + stories[i].Object._refObjectName,
               Estimate: randomInt(1, 4),
               Owner: setOwner(),
               Project: stories[i].Object.Project._ref
            });
        }
        tasks.push(rallyApi.add({
                ref: stories[i].Object._ref,  
                collection: 'Tasks', 
                data: data,
                fetch: ['FormattedID', 'Name', 'WorkProduct','Estimate'],
                requestOptions: {} 
            }));
        data = [];
    }
    return q.all(tasks); 
}


function findStoriesInCurrentIteration(result){
    return rallyApi.query({
        type: 'hierarchicalrequirement',
        limit: Infinity,
        fetch: ['FormattedID', 'Name', 'PlanEstimate', 'TaskEstimateTotal','Release'],
        query: (queryUtils.where('Iteration.StartDate', '<=', today)).and('Iteration.EndDate', '>=', today),
        scope: {
            workspace: workspaceRef
        },
    });   
}


function updateStories(result){
    console.log('stories length', result.Results.length);
    var stories = [];
    for(var i=0;i<result.Results.length;i++){
        var planEst = Math.floor(result.Results[i].TaskEstimateTotal/2);
        stories.push(rallyApi.update({
            ref: result.Results[i]._ref,
            data: {
                PlanEstimate: planEst,
                Owner: setOwner()
            },
            fetch: ['ObjectID','FormattedID','Release','Project','TaskEstimateTotal','PlanEstimate','Parent']
        }));
    }
    return q.all(stories);
}


function findEpicsLinkedToFeaturesInCurrentRelease(result){
    //console.log('stories length', result.length);
    //console.log('obj', result[0].Object);
    //save scheduled stories not to repeat findStoriesInCurrentIteration()
    for(var i=0;i<result.length;i++){
        scheduledStories.push(result[i].Object);
    }
    var query = queryUtils.where('Feature.Release.ReleaseStartDate', '<=', today);
    query = query.and('Feature.Release.ReleaseDate', '>=', today);
    query = query.and('Release', '=', null);
    var queryString = query.toQueryString();
    
    return  rallyApi.query({
                type: 'hierarchicalrequirement',
                limit: Infinity,
                fetch: ['FormattedID', 'Name', 'Feature','Project','Children'],
                query: queryString,
                scope: {
                    workspace: workspaceRef
                }
    });   
   
}

function setParent(result){
    //Children collection on a parent is read-only, have to update Parent on each story
    console.log('epics length', result.Results.length);
    var stories = [];
    //console.log('epic[0]._ref..', result.Results[0]._ref);
    //console.log('scheduledStories[0]...', scheduledStories[0].Project._refObjectName,scheduledStories[0].Parent);
    
    for(var i=0;i<scheduledStories.length;i++){
        var epicsInProject = _.filter(result.Results, function(epic){
            return epic.Project._refObjectName === scheduledStories[i].Project._refObjectName;
        });
        if (epicsInProject.length != 0) {
            var index = randomInt (0, epicsInProject.length - 1);
            //console.log('epicsInProject length', epicsInProject.length);
            //console.log('index',index);
            //console.log('epicsInProject[index]', epicsInProject[index]);
            var parentRef = epicsInProject[index]._ref;
            stories.push(rallyApi.update({
                ref: scheduledStories[i]._ref,
                data: {
                    Parent: parentRef
                },
                fetch: ['ObjectID','FormattedID','Release','Project','TaskEstimateTotal','PlanEstimate','Parent']
            }));
        }
    }
}

function setOwner() {
    var min = 0;
    var max = userOids.length-1;
    return 'https://rally1.rallydev.com/slm/webservice/v2.0/user/' + userOids[randomInt(min,max)];
}

function randomInt (low, high) {
        return Math.floor(Math.random() * (high - low + 1) + low);
}

function onSuccess(result) {
    console.log('Success!');
}


function onError(errors) {
    console.log('Failure!', errors);
}