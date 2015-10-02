var q = require('q');
var _ = require('lodash');

var rally = null;
var workspaceRef = '/workspace/123'; 
var userOids = ['666','777','888']; 
var millisecondsInDay = 86400000;


createRally();

getProjects()
    .then(function(result){
        var timeboxes = [];
        timeboxes.push(makeReleases(result));
        timeboxes.push(makeIterations(result));
        return q.all(timeboxes);
    })
    .then(function(result){
        var featuresAndMilestones = [];
        featuresAndMilestones.push(makeMilestones(result));
        featuresAndMilestones.push(makeFeatures(result));
        return q.all(featuresAndMilestones);
    })
    .then(function(result){
        var epicsAndFeatures = [];
        epicsAndFeatures.push(makeEpicStories(result));
        epicsAndFeatures.push(makeFeaturesForMilestones(result));
        return q.all(epicsAndFeatures);
    })
    .then(makeStoriesForMilestones)
    .then(onSuccess)
    .fail(onError);


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


function getProjects() {
    return rallyApi.query({
        ref: workspaceRef + '/projects',
        limit: Infinity,
        fetch: ['Name','ObjectID','State','Children','Parent'],
        query: (queryUtils.where('State', '=', 'Open')).and('Parent', '!=', null),
        requestOptions: {}
    });
}


function makeReleases(result) {
    var releases = [];
    var numOfReleasesEachProject = 1;
    var releaseLength = 30;
    var today = new Date();
        for(var n=0; n<numOfReleasesEachProject; n++){
            var releaseStartDate = new Date(today.getTime() + millisecondsInDay*n*(releaseLength));
            var releaseDate = new Date(releaseStartDate.getTime() + millisecondsInDay*releaseLength);
            var releaseName = 'Release ' + n;
            var data ={
                Name: releaseName,
                ReleaseStartDate: releaseStartDate.toISOString(),
                ReleaseDate: releaseDate.toISOString(),
                State: 'Planning'
            };
            for(var i=0; i<result.Results.length; i++){
                //if(result.Results[i].Children.ObjectID !== null){ //all return true, why?
                if (result.Results[i].Children.Count > 0) {
                    data.Notes = "CreateFeaturesMilestones:Yes";
                }
                else{
                    data.Notes = "";
                }
                console.log('CREATING RELEASE in ' + result.Results[i]._refObjectName);
                releases.push(rallyApi.create({
                    type: 'release',
                    data: data,
                    fetch: ['ObjectID','Project','ReleaseStartDate','Notes','ReleaseDate','PlannedVelocity','ChildrenPlannedVelocity'],  
                    scope: {
                        project: result.Results[i]
                    },
                }));
            }
        }
    return q.all(releases);
}

function makeIterations(result) {
    var iterations = [];
    var numOfIterationsEachProject = 2;
    var iterationLength = 15;
    var today = new Date();
        for(var n=0; n<numOfIterationsEachProject; n++){
            var iterationStartDate = new Date(today.getTime() + millisecondsInDay*n*(iterationLength));
            var iterationEndDate = new Date(iterationStartDate.getTime() + millisecondsInDay*iterationLength);
            var iterationName = 'Iteration ' + n;
            for(var i=0; i<result.Results.length; i++){
                console.log('CREATING  ITERATION in ' + result.Results[i]._refObjectName);
                iterations.push(rallyApi.create({
                    type: 'iteration',
                    data: {
                        Name: iterationName,
                        StartDate: iterationStartDate.toISOString(),
                        EndDate: iterationEndDate.toISOString(),
                        State: 'Planning'
                    },
                    fetch: ['ObjectID','Project','StartDate','EndDate'],  
                    scope: {
                        project: result.Results[i]
                    },
                }));
            }
        }
    return q.all(iterations);
}

function makeMilestones(result){
    var milestones = [];
    var releases = result[0];
    var randomDaysBeforeRelease = randomInt(1, 7);
    for (var i = 0; i < releases.length; i++) {
        //if (releases[i].Object.ChildrenPlannedVelocity !== 0) { //if not a leaf project
        //cannot rely on ChildrenPlannedVelocity to be calculated in time
        if (releases[i].Object.Notes === "CreateFeaturesMilestones:Yes") {
            var milestoneDate = new Date((new Date(releases[i].Object.ReleaseDate.substring(0,10)))
                                         - millisecondsInDay*randomDaysBeforeRelease);
            var targetProjectRef = releases[i].Object.Project._ref;
            var targetProjectName = releases[i].Object.Project._refObjectName;
            var milestoneName = 'Day ' + i +' on ' + targetProjectName;
            console.log('CREATING MILESTONE within ' + releases[i].Object.Project._refObjectName);
            milestones.push(rallyApi.create({
                    type: 'milestone',
                    data: {
                        Name: milestoneName,
                        TargetDate: milestoneDate,
                        TargetProject: targetProjectRef
                    },
                    fetch: ['ObjectID','FormattedID','TargetProject','TargetDate','Artifacts'],  
                    scope: {
                        project: releases[i].Object.Project
                    }
                }));
        }
    }
    return q.all(milestones);
}

function makeFeatures(result){
    console.log('CREATING FEATURES...');
    var features = [];
    var releases = result[0];
    var missionTypes = ['Flyby','Orbiter','Lander','Rover'];
    for (var i = 0; i < releases.length; i++) {
        //if (releases[i].Object.ChildrenPlannedVelocity !== 0) { //if not a leaf project
        //cannot rely on ChildrenPlannedVelocity to be calculated in time
        if (releases[i].Object.Notes === "CreateFeaturesMilestones:Yes") {
            var targetProjectRef = releases[i].Object.Project._ref;
            var targetProjectName = releases[i].Object.Project._refObjectName;
            var featureRelease = releases[i].Object._ref;
            var featurePlannedStartDate = releases[i].Object.ReleaseStartDate;
            var featurePlannedEndDate = releases[i].Object.ReleaseDate;
            console.log('CREATING FEATURE in ' + releases[i].Object.Project._refObjectName + ', release ' + releases[i].Object._refObjectName);
            for(var j = 0; j<missionTypes.length; j++){
                features.push(rallyApi.create({
                    type: 'portfolioitem/feature',
                    data: {
                        Name: targetProjectName  + ' ' + missionTypes[j] + ' feature ' + i,
                        Release: featureRelease,
                        PlannedStartDate: featurePlannedStartDate,
                        PlannedEndDate: featurePlannedEndDate,
                        Owner: setOwner()
                    },
                    fetch: ['ObjectID','FormattedID','Project'],  
                    scope: {
                        project: releases[i].Object.Project._ref
                    }
                }));
            }
        }
    }
    return q.all(features);
}

function makeFeaturesForMilestones(result){
    console.log('MAKING FEATRURES FOR MILESTONES');
    var features = [];
    var milestones = result[0];
    var featureForMilestoneLength = 14;
    var data = {};
    var numOfFeaturePerMilestone = randomInt(1, 3);
    for (var i = 0; i < milestones.length; i++) {
        (function( lockedIndex ){
            for(var n=0; n<numOfFeaturePerMilestone;n++){
                var plannedStartDate = new Date((new Date(milestones[lockedIndex].Object.TargetDate.substring(0,10)))
                                             - millisecondsInDay*featureForMilestoneLength);
                console.log('MAKING FEATRURE FOR MILESTONE ' + milestones[lockedIndex].Object.TargetDate + ' in project ' + milestones[lockedIndex].Object.TargetProject._refObjectName);
                data={
                    Name:milestones[lockedIndex].Object._refObjectName + ' feature ' + n,
                    PlannedEndDate: milestones[lockedIndex].Object.TargetDate,
                    PlannedStartDate: plannedStartDate,
                    Owner: setOwner()
                };
            }
            rallyApi.create({
                type: 'portfolioitem/feature',
                data:data,
                fetch: ['ObjectID','FormattedID','Project'],  
                scope: {
                    project:  milestones[lockedIndex].Object.TargetProject._ref
                }
            }).then(function(result){
                features.push(result);
                console.log('Feature..', result.Object._ref, 'Milestone..', milestones[lockedIndex].Object._ref); //won't get here without iife
                rallyApi.add({
                    ref: milestones[lockedIndex].Object._ref,  
                    collection: 'Artifacts', 
                    data: [{_ref: result.Object._ref}],
                    fetch: ['FormattedID', 'Name', 'Milestones', 'PlannedStartDate','PlannedEndDate','UserStories'],
                    requestOptions: {} 
                });
            });
            data = {};
        }(i));
    }
    return q.all(features);
}

function makeEpicStories(result){
    console.log('MAKING EPIC STOREIES');
    var milestones = result[0];
    var features = result[1];
    var epics = [];
    var data = [];
    var numOfStoriesPerFeature = randomInt(2, 4);
    for (var i = 0; i < features.length; i++) {
        for(var n=0; n<numOfStoriesPerFeature;n++){
            data.push({
               Name: 'Epic ' + n + ':' + i + ' of ' + features[i].Object._refObjectName,
               Project: features[i].Object.Project._ref,
               Owner: setOwner()
            });
        }
        epics.push(rallyApi.add({
                ref: features[i].Object._ref,  
                collection: 'UserStories', 
                data: data,
                fetch: ['FormattedID', 'Name', 'PortfolioItem','Feature'],
                requestOptions: {} 
            }));
        data = []; //clear
    }
    return q.all(epics);
}



function makeStoriesForMilestones(result){
    console.log('MAKING STORIES FOR MILESTONE FEATRURES');
    var features = result[1];
    var stories = [];
    var data = [];
    var numOfStoriesPerFeature = randomInt(2, 4);
    for (var i = 0; i < features.length; i++) {
        for(var n=0; n<numOfStoriesPerFeature;n++){
            data.push({
               Name: 'Story ' + n + ':' + i + ' of ' + features[i].Object._refObjectName,
               Project: features[i].Object.Project._ref,
               Owner: setOwner()
            });
        }
        stories.push(rallyApi.add({
                ref: features[i].Object._ref,  
                collection: 'UserStories', 
                data: data,
                fetch: ['FormattedID', 'Name', 'PortfolioItem','Feature'],
                requestOptions: {} 
            }));
        data = []; 
    }
    return q.all(stories);
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
