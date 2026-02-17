pipeline {
  agent any

  environment {
    IMAGE_BE = "arunabstruce/devops-manifest-be:latest"
    IMAGE_FE = "arunabstruce/devops-manifest-fe:latest"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build Images') {
      steps {
        sh """
          docker build -t $IMAGE_BE backend
          docker build -t $IMAGE_FE frontend
        """
      }
    }

    stage('Push Images') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'dockerhub-creds',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh """
            echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin
            docker push $IMAGE_BE
            docker push $IMAGE_FE
          """
        }
      }
    }

    stage('Deploy to Kubernetes (Helm)') {
      steps {
        withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG')]) {
          sh """
            helm upgrade --install devengine ./Helm/devengine -n devengine
          """
        }
      }
    }
  }
}
